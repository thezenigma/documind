"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cancelUpload, requestUpload } from "@/lib/document-actions";

const STAGE_COPY: Record<string, string> = {
  queued: "Waiting…",
  uploading: "Uploading…",
  reading: "Reading the file…",
  splitting: "Splitting into passages…",
  indexing: "Indexing passages…",
  ready: "Indexed and ready.",
  failed: "Indexing failed.",
};

type Phase = "idle" | "uploading" | "indexing" | "done";

export function UploadPanel({
  supabaseUrl,
  anonKey,
}: {
  supabaseUrl: string;
  anonKey: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(requestUpload, undefined);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [localError, setLocalError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [doneDocumentId, setDoneDocumentId] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const startedRef = useRef<string | null>(null);

  function reset() {
    setPhase("idle");
    setProgress(0);
    setStage("");
    setDoneDocumentId(null);
    startedRef.current = null;
    fileRef.current = null;
  }

  async function ingest(documentId: string) {
    setPhase("indexing");
    setStage(STAGE_COPY.reading);
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/documents/${documentId}/status`);
        if (res.ok) {
          const json = (await res.json()) as { status: string };
          setStage(STAGE_COPY[json.status] ?? json.status);
        }
      } catch {
        // transient poll failure, next tick retries
      }
    }, 2000);

    try {
      const res = await fetch(`/api/documents/${documentId}/ingest`, { method: "POST" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Indexing failed.");
      setStage("Indexed and ready.");
      setDoneDocumentId(documentId);
      setPhase("done");
      router.refresh();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Indexing failed.");
      setPhase("idle");
      router.refresh();
    } finally {
      clearInterval(interval);
    }
  }

  function beginUpload(
    file: File,
    creds: { documentId: string; token: string; storagePath: string },
  ) {
    setPhase("uploading");
    setProgress(0);
    setLocalError("");
    const encodedPath = creds.storagePath.split("/").map(encodeURIComponent).join("/");
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    // PUT to /object/upload/sign/<bucket>/<path> matches the official storage
    // client. The signed token binds bucket, path and expiry; no storage RLS
    // policies exist, so this is the only write path into the bucket.
    xhr.open(
      "PUT",
      `${supabaseUrl}/storage/v1/object/upload/sign/documents/${encodedPath}?token=${encodeURIComponent(creds.token)}`,
    );
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("Authorization", `Bearer ${anonKey}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      xhrRef.current = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        void ingest(creds.documentId);
      } else {
        setLocalError("The storage service rejected the upload. Try again.");
        setPhase("idle");
      }
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      setLocalError("The upload was interrupted. Check your connection and try again.");
      setPhase("idle");
    };
    xhr.send(file);
  }

  // The registration action resolved: either show its message or start the upload.
  useEffect(() => {
    if (!state || state.ok !== true || startedRef.current === state.documentId) return;
    const file = fileRef.current;
    if (!file) return;
    startedRef.current = state.documentId;
    beginUpload(file, state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function handleFile(file: File | undefined) {
    if (!file) return;
    fileRef.current = file;
    setLocalError("");
  }

  function handleSubmit() {
    if (!fileRef.current) {
      setLocalError("Choose a file to upload.");
      return false;
    }
    return true;
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    fileRef.current = file;
    setLocalError("");
    const fd = new FormData();
    fd.append("file", file);
    formAction(fd);
  }

  function handleCancel() {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    const documentId = startedRef.current;
    reset();
    if (documentId) {
      const fd = new FormData();
      fd.append("documentId", documentId);
      void cancelUpload(fd).then(() => router.refresh());
    }
  }

  const errorMessage =
    localError || (state && state.ok === false ? state.message : undefined);

  return (
    <section
      className={`rounded-[6px] border border-border bg-surface p-6 ${dragging ? "border-accent" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <h2 className="text-xl">Add a document</h2>
      <p className="mt-1 text-sm text-muted">
        PDF, Word, text, or Markdown. Up to 25 MB and 300 pages.
      </p>

      {phase === "idle" && (
        <form action={formAction} onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          {errorMessage && (
            <p className="form-message form-message-error" role="alert">
              {errorMessage}
            </p>
          )}
          <input
            type="file"
            name="file"
            accept=".pdf,.docx,.txt,.md"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="text-sm text-muted file:mr-4 file:rounded-[6px] file:border file:border-border file:bg-surface file:px-4 file:py-2 file:font-medium file:text-text"
          />
          <p className="text-sm text-muted">Or drop the file here.</p>
          <div>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Preparing…" : "Upload and index"}
            </button>
          </div>
        </form>
      )}

      {phase === "uploading" && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm" role="status">
            Uploading… {progress}%
          </p>
          <div className="h-1 w-full rounded-[6px] bg-border">
            <div className="h-1 rounded-[6px] bg-accent" style={{ width: `${progress}%` }} />
          </div>
          <div>
            <button type="button" className="btn btn-secondary" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase === "indexing" && (
        <div className="mt-4 flex flex-col gap-3" role="status">
          <p className="text-sm">{stage}</p>
          <p className="text-sm text-muted">
            Keep this tab open. Larger files take up to a minute.
          </p>
        </div>
      )}

      {phase === "done" && (
        <div className="mt-4 flex flex-col gap-3" role="status">
          <p className="form-message form-message-ok">{stage}</p>
          <div className="flex flex-wrap items-center gap-3">
            {doneDocumentId && (
              <Link href={`/ask?document=${doneDocumentId}`} className="btn btn-primary">
                Ask a question about it
              </Link>
            )}
            <button type="button" className="btn btn-secondary" onClick={reset}>
              Add another document
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
