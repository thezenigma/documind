import "server-only";
import { db } from "./db";
import { embedQuery } from "./nvidia";

export type Passage = {
  chunkId: string;
  documentId: string;
  fileName: string;
  pageStart: number;
  pageEnd: number;
  sectionTitle: string | null;
  text: string;
  similarity: number;
};

/**
 * Hybrid retrieval (vector + keyword, reciprocal rank fusion) implemented in
 * the match_chunks SQL function, top 8 passages, always restricted to the
 * signed-in user's ready documents.
 */
export async function retrievePassages(opts: {
  userId: string;
  question: string;
  documentIds: string[];
}): Promise<Passage[]> {
  const embedding = await embedQuery(opts.question);
  const { data, error } = await db().rpc("match_chunks", {
    p_query_embedding: JSON.stringify(embedding),
    p_query_text: opts.question,
    p_user_id: opts.userId,
    p_document_ids: opts.documentIds,
    p_limit: 8,
  });
  if (error) {
    console.error("[retrieval] match_chunks failed:", error.message);
    throw new Error("Could not search your documents.");
  }
  const rows = (data ?? []) as Array<{
    chunk_id: string;
    document_id: string;
    page_start: number;
    page_end: number;
    section_title: string | null;
    chunk_text: string;
    similarity: number;
  }>;
  if (rows.length === 0) return [];

  const documentIds = [...new Set(rows.map((r) => r.document_id))];
  const { data: docs, error: docsError } = await db()
    .from("documents")
    .select("id, file_name")
    .in("id", documentIds);
  if (docsError) {
    console.error("[retrieval] document names failed:", docsError.message);
    throw new Error("Could not search your documents.");
  }
  const nameById = new Map((docs ?? []).map((d) => [d.id as string, d.file_name as string]));

  return rows.map((r) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    fileName: nameById.get(r.document_id) ?? "document",
    pageStart: r.page_start,
    pageEnd: r.page_end,
    sectionTitle: r.section_title,
    text: r.chunk_text,
    similarity: r.similarity,
  }));
}
