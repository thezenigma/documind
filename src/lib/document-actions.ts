"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { db } from "./db";
import { requireUser } from "./dal";
import { createSignedUpload, MAX_UPLOAD_BYTES, removeObjects } from "./storage";

export type UploadFormState =
  | {
      ok: true;
      documentId: string;
      token: string;
      storagePath: string;
    }
  | { ok: false; message: string }
  | undefined;

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];

// F9: document counts are what the library holds right now, not per month,
// so deleting frees the slot immediately (shared with src/lib/usage.ts).
const FREE_DOCUMENTS = 3;
const PRO_DOCUMENTS = 50;

function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "document";
  return base.replace(/[^\w.\- ]/g, "_").slice(0, 200);
}

/** Registers a document row and returns a signed upload credential for the browser. */
export async function requestUpload(_prev: UploadFormState, formData: FormData): Promise<UploadFormState> {
  const user = await requireUser();
  if (!user.emailVerified) {
    return { ok: false, message: "Verify your email before uploading documents." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a file to upload." };
  }

  const name = safeFileName(file.name);
  const lower = name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return {
      ok: false,
      message: "That file type is not supported. Upload a PDF, Word document, text file, or Markdown file.",
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "That file is larger than the 25 MB limit. Split it or export a smaller version." };
  }

  const { count, error: countError } = await db()
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (countError) {
    console.error("[upload] quota check failed:", countError.message);
    return { ok: false, message: "Could not check your document quota. Try again in a moment." };
  }
  const limit = user.plan === "pro" ? PRO_DOCUMENTS : FREE_DOCUMENTS;
  if ((count ?? 0) >= limit) {
    return {
      ok: false,
      message: `Your ${user.plan === "pro" ? "Pro" : "free"} plan stores up to ${limit} documents, and your library already has ${count}. Delete a document or upgrade to add more.`,
    };
  }

  const documentId = randomUUID();
  const storagePath = `${user.id}/${documentId}/${name}`;
  const { error: insertError } = await db().from("documents").insert({
    id: documentId,
    user_id: user.id,
    file_name: name,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    status: "uploading",
    storage_key: storagePath,
  });
  if (insertError) {
    console.error("[upload] insert failed:", insertError.message);
    return { ok: false, message: "Could not register the document. Try again." };
  }

  try {
    const signed = await createSignedUpload(storagePath);
    return { ok: true, documentId, token: signed.token, storagePath };
  } catch (err) {
    await db().from("documents").delete().eq("id", documentId);
    return { ok: false, message: err instanceof Error ? err.message : "Could not prepare the upload." };
  }
}

/** Removes a document, its stored file, and its chunks (cascade). Owner checked. */
export async function deleteDocument(formData: FormData): Promise<void> {
  const user = await requireUser();
  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) return;

  const { data: doc } = await db()
    .from("documents")
    .select("storage_key")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!doc) return;

  await removeObjects([doc.storage_key]);
  const { error } = await db().from("documents").delete().eq("id", documentId).eq("user_id", user.id);
  if (error) console.error("[delete] document removal failed:", error.message);
  redirect("/library");
}

/** Aborts a registration that never finished uploading. */
export async function cancelUpload(formData: FormData): Promise<void> {
  const user = await requireUser();
  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) return;

  const { data: doc } = await db()
    .from("documents")
    .select("storage_key, status")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!doc || doc.status !== "uploading") return;

  await removeObjects([doc.storage_key]);
  await db().from("documents").delete().eq("id", documentId).eq("user_id", user.id);
}
