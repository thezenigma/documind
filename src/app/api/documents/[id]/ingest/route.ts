import { getCurrentUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { chunkPages, extractDocx, extractPdf, extractPlainText } from "@/lib/ingest";
import { embedPassages } from "@/lib/nvidia";
import { downloadObject, MAX_UPLOAD_BYTES } from "@/lib/storage";

// Next 16 with Cache Components runs routes on the Node.js runtime by default.
// PRD target: a 50-page PDF ingests in under 60 seconds. Long uploads need headroom.
export const maxDuration = 300;

const EMBED_BATCH = 24;
const INSERT_BATCH = 100;

async function setStatus(documentId: string, status: string): Promise<void> {
  const { error } = await db().from("documents").update({ status }).eq("id", documentId);
  if (error) console.error("[ingest] status update failed:", error.message);
}

function looksLikePdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

function looksLikeZip(buffer: Buffer): boolean {
  return buffer[0] === 0x50 && buffer[1] === 0x4b;
}

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user || !user.emailVerified) {
    return Response.json({ error: "Not allowed." }, { status: 403 });
  }
  const { id } = await ctx.params;

  const { data: doc } = await db()
    .from("documents")
    .select("id, user_id, file_name, mime_type, size_bytes, status, storage_key")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!doc) return Response.json({ error: "Document not found." }, { status: 404 });
  if (doc.status === "ready") return Response.json({ ok: true, status: "ready" });
  if (doc.status !== "uploading") {
    return Response.json({ error: "This document is not waiting to be indexed." }, { status: 409 });
  }

  try {
    // Reading
    await setStatus(id, "reading");
    const buffer = await downloadObject(doc.storage_key);
    if (buffer.length === 0) throw new Error("The uploaded file is empty.");
    if (buffer.length > MAX_UPLOAD_BYTES) throw new Error("The file is larger than the 25 MB limit.");

    const lower = doc.file_name.toLowerCase();
    let extracted;
    if (lower.endsWith(".pdf")) {
      if (!looksLikePdf(buffer)) throw new Error("That file is not a readable PDF.");
      extracted = await extractPdf(buffer);
    } else if (lower.endsWith(".docx")) {
      if (!looksLikeZip(buffer)) throw new Error("That file is not a readable Word document.");
      extracted = await extractDocx(buffer);
    } else {
      extracted = await extractPlainText(buffer);
    }

    const readablePages = extracted.pages.filter((p) => p.text.length > 0);
    if (readablePages.length === 0) {
      throw new Error(
        "No readable text was found in this file. Scanned or image-only PDFs need OCR before they can be indexed.",
      );
    }

    // Splitting
    await setStatus(id, "splitting");
    const chunks = chunkPages(extracted.pages);
    if (chunks.length === 0) throw new Error("No text passages could be extracted from this file.");

    // Indexing
    await setStatus(id, "indexing");
    await db().from("chunks").delete().eq("document_id", id);
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const vectors = await embedPassages(batch.map((c) => c.text));
      for (let j = 0; j < batch.length; j += INSERT_BATCH) {
        const rows = batch.slice(j, j + INSERT_BATCH).map((c, k) => ({
          document_id: id,
          page_start: c.pageStart,
          page_end: c.pageEnd,
          section_title: c.sectionTitle,
          text: c.text,
          token_count: c.tokenCount,
          embedding: JSON.stringify(vectors[j + k]),
        }));
        const { error } = await db().from("chunks").insert(rows);
        if (error) {
          console.error("[ingest] chunk insert failed:", error.message);
          throw new Error("Could not save the text passages. Try uploading again.");
        }
      }
    }

    const { error } = await db()
      .from("documents")
      .update({
        status: "ready",
        pages: extracted.totalPages ?? Math.max(...readablePages.map((p) => p.page)),
        error: null,
      })
      .eq("id", id);
    if (error) {
      console.error("[ingest] ready update failed:", error.message);
      throw new Error("Could not finish indexing. Try uploading again.");
    }

    return Response.json({ ok: true, chunks: chunks.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingestion failed for an unknown reason.";
    console.error("[ingest] failed:", message);
    await db().from("documents").update({ status: "failed", error: message }).eq("id", id);
    return Response.json({ error: message }, { status: 500 });
  }
}
