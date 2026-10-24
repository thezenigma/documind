import "server-only";
import type { Passage } from "./retrieval";

export type CitationRecord = {
  n: number;
  chunkId: string;
  documentId: string;
  fileName: string;
  pageStart: number;
  pageEnd: number;
  /** The quoted span the answer attributed to this passage, if any. */
  quote: string | null;
  /** PRD section 7: id exists in the retrieved set and quotes match the text. */
  verified: boolean;
};

type VerificationResult = {
  citations: CitationRecord[];
  unverifiedCount: number;
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Builds the citation records for the passages actually cited in the answer
 * and runs the PRD verification: every cited id must exist in the retrieved
 * set, and any quoted span must appear in the passage it is attributed to.
 * Failures are marked unverified, never presented as checked.
 */
export function verifyCitations(answer: string, passages: Passage[]): VerificationResult {
  const byN = new Map<number, Passage>();
  passages.forEach((p, i) => byN.set(i + 1, p));

  // Unique cited ids in order of first appearance.
  const cited: number[] = [];
  const idPattern = /\[(\d{1,2})\]/g;
  for (const match of answer.matchAll(idPattern)) {
    const n = Number(match[1]);
    if (!cited.includes(n)) cited.push(n);
  }
  // Cited ids outside the retrieved set are recorded as their own
  // unverified entries so the interface can flag them honestly.
  const records: CitationRecord[] = cited.map((n) => {
    const p = byN.get(n);
    if (!p) {
      return {
        n,
        chunkId: "",
        documentId: "",
        fileName: "unknown passage",
        pageStart: 0,
        pageEnd: 0,
        quote: null,
        verified: false,
      };
    }
    return {
      n,
      chunkId: p.chunkId,
      documentId: p.documentId,
      fileName: p.fileName,
      pageStart: p.pageStart,
      pageEnd: p.pageEnd,
      quote: null,
      verified: true,
    };
  });

  // Quoted spans: attribute each to the nearest cited id before it and check
  // the quoted text really appears in that passage.
  const quotePattern = /["\u201c]([^"\n\u201c\u201d]{15,300})["\u201d]/g;
  for (const match of answer.matchAll(quotePattern)) {
    const span = match[1];
    const before = answer.slice(0, match.index ?? 0);
    let ownerN: number | null = null;
    const beforeIds = [...before.matchAll(/\[(\d{1,2})\]/g)];
    if (beforeIds.length > 0) ownerN = Number(beforeIds[beforeIds.length - 1][1]);

    const record =
      records.find((r) => r.n === ownerN) ?? records.find((r) => r.verified) ?? null;
    if (!record) {
      // A quote with no cited passage: nothing trustworthy to attach it to.
      records.push({
        n: 0,
        chunkId: "",
        documentId: "",
        fileName: "unknown passage",
        pageStart: 0,
        pageEnd: 0,
        quote: span,
        verified: false,
      });
      continue;
    }
    record.quote = span;
    const passage = byN.get(record.n);
    if (!passage || !normalize(passage.text).includes(normalize(span))) {
      record.verified = false;
    }
  }

  return {
    citations: records,
    unverifiedCount: records.filter((r) => !r.verified).length,
  };
}
