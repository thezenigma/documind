"use client";

import { useEffect, useRef, useState } from "react";

export type ViewerTarget = {
  documentId: string;
  fileName: string;
  page: number;
  chunkId: string;
  quote: string | null;
};

type PageData = {
  fileName: string;
  page: number;
  totalPages: number | null;
  text: string;
  passage: string | null;
};

type LoadedPage = {
  key: string;
  data: PageData | null;
  error: string;
};

/** Normalizes case and whitespace while remembering where each normalized
    character came from, so a match in normalized text maps back to an exact
    range in the original page text. */
function buildNorm(text: string): { norm: string; map: number[] } {
  const map: number[] = [];
  let norm = "";
  let prevSpace = true; // Drop leading whitespace.
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const isSpace = code === 32 || code === 9 || code === 10 || code === 13;
    if (isSpace) {
      if (!prevSpace) {
        norm += " ";
        map.push(i);
      }
      prevSpace = true;
    } else {
      norm += text[i].toLowerCase();
      map.push(i);
      prevSpace = false;
    }
  }
  while (norm.endsWith(" ")) {
    norm = norm.slice(0, -1);
    map.pop();
  }
  return { norm, map };
}

function findMark(text: string, needle: string): { start: number; end: number } | null {
  const target = needle.toLowerCase().replace(/\s+/g, " ").trim();
  if (target.length < 3) return null;
  const { norm, map } = buildNorm(text);
  const at = norm.indexOf(target);
  if (at < 0) return null;
  const start = map[at];
  const end = map[at + target.length - 1] + 1;
  return end > start ? { start, end } : null;
}

function firstSentence(text: string): string {
  const limit = Math.min(text.length, 400);
  for (let i = 40; i < limit; i++) {
    if (text[i] === "." || text[i] === "\n") return text.slice(0, i + 1);
  }
  return text.slice(0, 120);
}

/** Location candidates for the highlight, most specific first: a quoted span
    from the answer, the full cited passage, then its opening sentence. */
function locateHighlight(data: PageData): { start: number; end: number } | null {
  const candidates: string[] = [];
  if (data.passage) {
    const q = data.passage.match(/["\u201c]([^"\n\u201c\u201d]{15,300})["\u201d]/);
    if (q) candidates.push(q[1]);
    candidates.push(data.passage, firstSentence(data.passage));
  }
  for (const candidate of candidates) {
    const range = findMark(data.text, candidate);
    if (range) return range;
  }
  return null;
}

export function DocumentsViewer({
  target,
  onBrowse,
}: {
  target: ViewerTarget | null;
  onBrowse: (page: number) => void;
}) {
  const [loaded, setLoaded] = useState<LoadedPage | null>(null);
  const [attempt, setAttempt] = useState(0);
  const markRef = useRef<HTMLElement | null>(null);

  const viewPage = target?.page ?? 1;
  const key = target ? `${target.documentId}:${viewPage}:${target.chunkId}` : "";

  // Derived states: a mismatch between the requested view and the last
  // settled load means the page is in flight. No state writes on effect entry.
  const current = loaded && loaded.key === key ? loaded : null;
  const loading = !!target && !current;
  const data = current?.data ?? null;
  const error = current?.error ?? "";

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    const fetchKey = key;
    const chunk = target.chunkId ? `?chunk=${target.chunkId}` : "";
    fetch(`/api/documents/${target.documentId}/page/${viewPage}${chunk}`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setLoaded({ key: fetchKey, data: json as PageData, error: "" });
        } else {
          const message =
            (json as { error?: string }).error ?? "The page could not be loaded. Try again.";
          setLoaded({ key: fetchKey, data: null, error: message });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded({ key: fetchKey, data: null, error: "The page could not be loaded. Try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [target, viewPage, key, attempt]);

  // Scroll the cited text into view once its page has rendered.
  useEffect(() => {
    if (!loading && !error && markRef.current) {
      markRef.current.scrollIntoView({ block: "center" });
    }
  }, [loading, error, data]);

  if (!target) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-[6px] border border-border bg-surface p-6">
        <p className="text-center text-base text-muted">
          Open a citation and its source passage appears here, highlighted on
          the page it came from.
        </p>
      </div>
    );
  }

  const highlight = data ? locateHighlight(data) : null;
  const canPrev = viewPage > 1;
  const canNext = data ? data.totalPages == null || viewPage < data.totalPages : false;

  return (
    <div className="rounded-[6px] border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {data ? data.fileName : target.fileName}
          </p>
          <p className="text-sm text-muted" role="status">
            {loading
              ? "Loading the page…"
              : data
                ? `Page ${data.page} of ${data.totalPages ?? data.page}`
                : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canPrev || loading}
            onClick={() => onBrowse(Math.max(1, viewPage - 1))}
          >
            Previous page
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canNext || loading}
            onClick={() => onBrowse(viewPage + 1)}
          >
            Next page
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <p className="form-message form-message-error" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="btn btn-secondary mt-3"
            onClick={() => {
              setLoaded(null);
              setAttempt((a) => a + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}

      {!error && data && (
        <div className="mt-4">
          <p className="max-w-[68ch] break-words whitespace-pre-wrap text-base leading-relaxed">
            {highlight ? (
              <>
                {data.text.slice(0, highlight.start)}
                <mark className="evidence" ref={markRef}>
                  {data.text.slice(highlight.start, highlight.end)}
                </mark>
                {data.text.slice(highlight.end)}
              </>
            ) : (
              data.text
            )}
          </p>
          {data.passage && (
            <div className="mt-5 border-t border-border pt-3">
              <p className="text-sm font-semibold">Cited passage</p>
              <p className="mt-1 max-w-[68ch] whitespace-pre-wrap text-sm text-muted">
                {data.passage}
              </p>
            </div>
          )}
        </div>
      )}

      {!error && !data && loading && (
        <p className="mt-4 text-muted" role="status">
          Loading the page…
        </p>
      )}
    </div>
  );
}
