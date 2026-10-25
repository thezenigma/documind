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
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}\u00a0MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}\u00a0KB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function DocumentsList({ documents }: { documents: DocumentSummary[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [polledMs, setPolledMs] = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);

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
      <section className="mt-8">
        <h2 className="text-xl">No documents yet</h2>
        <p className="mt-2 text-base text-muted">
          Upload a PDF, Word document, text file, or Markdown file up to 25 MB
          and 300 pages. Once it is indexed, ask a question in plain language
          and every answer will point to the page it came from.
        </p>
      </section>
    );
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visible = normalizedQuery
    ? documents.filter((d) => d.file_name.toLowerCase().includes(normalizedQuery))
    : documents;

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-xl">
          Documents
          <span className="ml-2 font-mono text-sm text-muted">
            {visible.length === documents.length
              ? `${documents.length}`
              : `${visible.length} of ${documents.length}`}
          </span>
        </h2>
        <div className="w-full sm:w-80">
          <label htmlFor="document-search" className="text-sm font-medium">
            Search by file name
          </label>
          <input
            id="document-search"
            name="document-search"
            type="search"
            className="input mt-1"
            placeholder="handbook…"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setConfirmId(null);
            }}
          />
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-left">
          <caption className="sr-only">
            Documents in your library with page counts, processing status, and
            the date each was added
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-4 text-sm font-medium text-muted">
                Name
              </th>
              <th scope="col" className="py-2 px-4 text-sm font-medium text-muted">
                Pages
              </th>
              <th scope="col" className="py-2 px-4 text-sm font-medium text-muted">
                Status
              </th>
              <th scope="col" className="py-2 px-4 text-sm font-medium text-muted">
                Date added
              </th>
              <th scope="col" className="py-2 pl-4 text-sm font-medium text-muted">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-base text-muted">
                  No documents match &ldquo;{query.trim()}&rdquo;. Clear the
                  search to see all files.
                </td>
              </tr>
            ) : (
              visible.map((doc) => (
                <tr key={doc.id} className="border-b border-border align-top">
                  <td className="py-3 pr-4">
                    <p className="max-w-[16rem] break-words text-base font-semibold">
                      {doc.file_name}
                    </p>
                    <p className="mt-0.5 font-mono text-sm text-muted">
                      {formatSize(doc.size_bytes)}
                    </p>
                    {doc.status === "failed" && doc.error && (
                      <p className="mt-1 max-w-[22rem] break-words text-sm text-error" role="alert">
                        {doc.error}
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-sm tabular-nums text-muted">
                    {doc.pages ?? 1}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-sm font-medium ${
                        doc.status === "failed"
                          ? "text-error"
                          : doc.status === "ready"
                            ? "text-accent"
                            : "text-muted"
                      }`}
                    >
                      {STATUS_COPY[doc.status] ?? doc.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-sm tabular-nums text-muted">
                    {formatDate(doc.created_at)}
                  </td>
                  <td className="py-3 pl-4">
                    {confirmId === doc.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-muted">Delete this document?</span>
                        <form action={deleteDocument}>
                          <input type="hidden" name="documentId" value={doc.id} />
                          <button
                            type="submit"
                            className="btn btn-secondary text-sm text-error"
                            autoFocus
                          >
                            Delete
                          </button>
                        </form>
                        <button
                          type="button"
                          className="btn btn-secondary text-sm"
                          onClick={() => setConfirmId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="text-sm font-medium text-error hover:underline"
                        onClick={() => setConfirmId(doc.id)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
