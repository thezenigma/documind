import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export type PageText = { page: number; text: string };

export type ExtractedDocument = {
  pages: PageText[];
  /** Real page count for PDFs; null when the format has no fixed pages (docx, txt, md). */
  totalPages: number | null;
};

export async function extractPdf(buffer: Buffer): Promise<ExtractedDocument> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const perPage = text as unknown as string[];
  return {
    pages: perPage.map((t, i) => ({ page: i + 1, text: (t ?? "").trim() })),
    totalPages,
  };
}

export async function extractDocx(buffer: Buffer): Promise<ExtractedDocument> {
  const { value } = await mammoth.extractRawText({ buffer });
  return { pages: [{ page: 1, text: value.trim() }], totalPages: null };
}

export async function extractPlainText(buffer: Buffer): Promise<ExtractedDocument> {
  return { pages: [{ page: 1, text: buffer.toString("utf8").trim() }], totalPages: null };
}

/* Chunking: ~450 token passages, paragraph aware, page numbers preserved. */

const TARGET_CHARS = 1800; // roughly 450 tokens
const MAX_CHARS = 2600;
const OVERLAP_CHARS = 120;

export type ChunkDraft = {
  pageStart: number;
  pageEnd: number;
  sectionTitle: string | null;
  text: string;
  tokenCount: number;
};

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

function splitLongParagraph(text: string): string[] {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > MAX_CHARS) {
    let cut = rest.lastIndexOf(". ", MAX_CHARS);
    if (cut < MAX_CHARS * 0.4) cut = rest.lastIndexOf(" ", MAX_CHARS);
    if (cut <= 0) cut = MAX_CHARS;
    pieces.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(Math.max(1, cut + 1 - OVERLAP_CHARS)).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

function findSectionTitle(firstText: string): string | null {
  const firstLine = firstText.split("\n")[0].trim();
  if (firstLine.length === 0 || firstLine.length > 80) return null;
  if (firstLine.endsWith(".") || firstLine.endsWith(",")) return null;
  return firstLine;
}

export function chunkPages(pages: PageText[]): ChunkDraft[] {
  const chunks: ChunkDraft[] = [];
  let current: PageText[] = [];
  let currentLen = 0;

  const flush = () => {
    if (current.length === 0) return;
    const text = current.map((c) => c.text).join("\n\n").trim();
    if (text) {
      chunks.push({
        pageStart: current[0].page,
        pageEnd: current[current.length - 1].page,
        sectionTitle: findSectionTitle(current[0].text),
        text,
        tokenCount: Math.ceil(text.length / 4),
      });
    }
    current = [];
    currentLen = 0;
  };

  for (const { page, text } of pages) {
    for (const para of splitParagraphs(text)) {
      if (para.length > MAX_CHARS) {
        flush();
        for (const piece of splitLongParagraph(para)) {
          chunks.push({
            pageStart: page,
            pageEnd: page,
            sectionTitle: findSectionTitle(piece),
            text: piece,
            tokenCount: Math.ceil(piece.length / 4),
          });
        }
        continue;
      }
      if (currentLen + para.length > TARGET_CHARS && current.length > 0) flush();
      current.push({ page, text: para });
      currentLen += para.length + 2;
    }
  }
  flush();
  return chunks;
}
