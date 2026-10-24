"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteDocument } from "@/lib/document-actions";

export type DocumentSummary = {
  id: string;
  file_name: string;
  size_bytes: number;
  pages: number | null;
  status: string;
  error: string | null;
  created_at: string;
};

const STATUS_COPY: Record<string, string> = {
  queued: "Waiting",
  uploading: "Uploading",
  reading: "Reading",
  splitting: "Splitting",
  indexing: "Indexing",
  ready: "Ready",
  failed: "Failed",
};

const TRANSITIONAL = new Set(["queued", "uploading", "reading", "splitting", "indexing"]);

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function DocumentsList({ documents }: { documents: DocumentSummary[] }) {
  const router = useRouter();
  const [polledMs, setPolledMs] = useState(0);

  const hasTransitional = documents.some((d) => TRANSITIONAL.has(d.status));

  useEffect(() => {
    if (!hasTransitional || polledMs >= 6 * 60 * 1000) return;
    const timer = setInterval(() => {
      setPolledMs((ms) => ms + 2500);
      router.refresh();
    }, 2500);
    return () => clearInterval(timer);
  }, [hasTransitional, polledMs, router]);

  if (documents.length === 0) {
    return (
      <section className="mt-8 rounded-[6px] border border-border bg-surface p-8">
        <h2 className="text-xl">No documents yet</h2>
        <p className="mt-2 text-base text-muted">
          Upload a PDF, Word document, text file, or Markdown file up to 25 MB
          and 300 pages. Once it is indexed, ask a question in plain language
          and every answer will point to the page it came from.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <h2 className="text-xl">Documents</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-border bg-surface px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium">{doc.file_name}</p>
              <p className="text-sm text-muted">
                {formatSize(doc.size_bytes)}
                {doc.pages ? `, ${doc.pages} ${doc.pages === 1 ? "page" : "pages"}` : ""}
                {" · "}
                {formatDate(doc.created_at)}
              </p>
              {doc.status === "failed" && doc.error && (
                <p className="mt-1 text-sm text-error" role="alert">
                  {doc.error}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`text-sm ${doc.status === "failed" ? "text-error" : doc.status === "ready" ? "text-accent" : "text-muted"}`}
              >
                {STATUS_COPY[doc.status] ?? doc.status}
              </span>
              <form action={deleteDocument}>
                <input type="hidden" name="documentId" value={doc.id} />
                <button type="submit" className="btn btn-secondary text-sm">
                  Delete
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
