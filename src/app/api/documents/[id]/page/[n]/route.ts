import { getCurrentUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { extractDocx, extractPdf, extractPlainText } from "@/lib/ingest";
import { downloadObject } from "@/lib/storage";

const PAGE_INSERT_BATCH = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DocRow = {
  id: string;
  file_name: string;
  storage_key: string;
  pages: number | null;
};

/** Documents indexed before page text was stored get their pages extracted
    once, on first request, and saved for every later visit. */
async function backfillPages(doc: DocRow): Promise<void> {
  const buffer = await downloadObject(doc.storage_key);
  const lower = doc.file_name.toLowerCase();
  let extracted;
  if (lower.endsWith(".pdf")) extracted = await extractPdf(buffer);
  else if (lower.endsWith(".docx")) extracted = await extractDocx(buffer);
  else extracted = await extractPlainText(buffer);

  const rows = extracted.pages.map((p) => ({
    document_id: doc.id,
    page_number: p.page,
    text: p.text,
  }));
  await db().from("document_pages").delete().eq("document_id", doc.id);
  for (let i = 0; i < rows.length; i += PAGE_INSERT_BATCH) {
    const { error } = await db().from("document_pages").insert(rows.slice(i, i + PAGE_INSERT_BATCH));
    if (error) {
      console.error("[page] backfill insert failed:", error.message);
      throw new Error("The page text could not be saved.");
    }
  }
  console.log(`[page] backfilled ${rows.length} pages for doc=${doc.id}`);
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; n: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to read this page." }, { status: 403 });
  }

  const { id, n } = await ctx.params;
  const pageNumber = Number(n);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    return Response.json({ error: "That page number is not valid." }, { status: 400 });
  }

  const { data: doc, error: docError } = await db()
    .from("documents")
    .select("id, file_name, storage_key, pages, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (docError) {
    console.error("[page] document lookup failed:", docError.message);
    return Response.json({ error: "Could not load this page. Try again." }, { status: 500 });
  }
  if (!doc) return Response.json({ error: "Document not found." }, { status: 404 });
  if (doc.status !== "ready") {
    return Response.json({ error: "This document is not ready to read yet." }, { status: 409 });
  }

  let { data: pageRow } = await db()
    .from("document_pages")
    .select("text")
    .eq("document_id", id)
    .eq("page_number", pageNumber)
    .maybeSingle();

  if (!pageRow) {
    // Distinguish "never stored" from "page out of range".
    const { count } = await db()
      .from("document_pages")
      .select("*", { count: "exact", head: true })
      .eq("document_id", id);
    if (count === 0) {
      try {
        await backfillPages(doc);
      } catch (err) {
        console.error("[page] backfill failed:", err instanceof Error ? err.message : err);
        return Response.json({ error: "The page text could not be loaded." }, { status: 500 });
      }
      const retry = await db()
        .from("document_pages")
        .select("text")
        .eq("document_id", id)
        .eq("page_number", pageNumber)
        .maybeSingle();
      pageRow = retry.data;
    }
  }
  if (!pageRow) {
    return Response.json({ error: "That page does not exist in this document." }, { status: 404 });
  }

  // Optional: the cited passage's full text, for locating the highlight.
  const url = new URL(_request.url);
  const chunkId = url.searchParams.get("chunk");
  let passage: string | null = null;
  if (chunkId && UUID_RE.test(chunkId)) {
    const { data: chunk } = await db()
      .from("chunks")
      .select("text")
      .eq("id", chunkId)
      .eq("document_id", id)
      .maybeSingle();
    passage = chunk?.text ?? null;
  }

  return Response.json({
    fileName: doc.file_name,
    page: pageNumber,
    totalPages: doc.pages,
    text: pageRow.text,
    passage,
  });
}
