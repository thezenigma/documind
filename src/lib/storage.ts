import "server-only";
import { db } from "./db";

export const DOCUMENTS_BUCKET = "documents";
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function bucket() {
  return db().storage.from(DOCUMENTS_BUCKET);
}

/** Server-signed upload credential. The browser writes one file to one path, nothing else. */
export async function createSignedUpload(path: string): Promise<{ token: string; path: string }> {
  const { data, error } = await bucket().createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[storage] signed upload failed:", error?.message);
    throw new Error("Could not prepare the upload. Try again.");
  }
  return data;
}

export async function downloadObject(path: string): Promise<Buffer> {
  const { data, error } = await bucket().download(path);
  if (error || !data) {
    console.error("[storage] download failed:", error?.message);
    throw new Error("Could not read the uploaded file. Try uploading it again.");
  }
  const bytes = await data.arrayBuffer();
  return Buffer.from(bytes);
}

export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await bucket().remove(paths);
  if (error) console.error("[storage] remove failed:", error.message);
}
