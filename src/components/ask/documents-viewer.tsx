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

/** Collapse extraction line breaks for display: single newlines become spaces
    so sentences flow, blank lines stay paragraph breaks. Matching and slicing
    both run on this same string, so highlight ranges keep pointing at the
    characters on screen. */
function displayText(raw: string): string {
  return raw
    .split(/\n\s*\n/)
    .map((para) => para.replace(/\n/g, " "))
    .join("\n\n");
}

function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+["'\u201d)]?\s*/g) ?? [];
}

type Highlight = { start: number; end: number; partial: boolean };

/** Location for the highlight, most specific first: a quoted span from the
    answer, the full cited passage when it sits entirely on this page, then
    the stretch of the passage that appears here, for chunks that run across
    page boundaries. partial marks that the passage continues elsewhere. */
function locateHighlight(data: PageData, text: string): Highlight | null {
  if (!data.passage) return null;
  const quoted = data.passage.match(/["\u201c]([^"\n\u201c\u201d]{15,300})["\u201d]/);
  if (quoted) {
    const range = findMark(text, quoted[1]);
    if (range) return { ...range, partial: false };
  }
  const whole = findMark(text, data.passage);
  if (whole) return { ...whole, partial: false };
  let start = -1;
  let end = -1;
  for (const sentence of splitSentences(data.passage)) {
    if (sentence.trim().length < 20) continue;
    const range = findMark(text, sentence);
    if (!range) continue;
    if (start < 0 || range.start < start) start = range.start;
    if (range.end > end) end = range.end;
  }
  if (start >= 0 && end > start) return { start, end, partial: true };
  return null;
}

/** Page text never changes for an uploaded document, so successful loads are
    kept for the session. The cache also collapses repeat requests for the
    same page into a single fetch. Failed loads are evicted so retry works. */
const pageCache = new Map<string, Promise<PageData>>();

function loadPage(url: string): Promise<PageData> {
  const cached = pageCache.get(url);
  if (cached) return cached;
  const pending = fetch(url)
    .then(async (res) => {
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error ?? "The page could not be loaded. Try again.",
        );
      }
      return json as PageData;
    })
    .catch((err: unknown) => {
      pageCache.delete(url);
      throw err;
    });
  pageCache.set(url, pending);
  return pending;
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
    loadPage(`/api/documents/${target.documentId}/page/${viewPage}${chunk}`)
      .then((data) => {
        if (!cancelled) setLoaded({ key: fetchKey, data, error: "" });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error && err.message
            ? err.message
            : "The page could not be loaded. Try again.";
        setLoaded({ key: fetchKey, data: null, error: message });
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

  const text = data ? displayText(data.text) : "";
  const highlight = data ? locateHighlight(data, text) : null;
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
                {text.slice(0, highlight.start)}
                <mark
                  key={`${highlight.start}-${highlight.end}`}
                  className="evidence"
                  ref={markRef}
                >
                  {text.slice(highlight.start, highlight.end)}
                </mark>
                {text.slice(highlight.end)}
              </>
            ) : (
              text
            )}
          </p>
          {data.passage && (
            <div className="mt-5 border-t border-border pt-3">
              <p className="text-sm font-semibold">Cited passage</p>
              <p className="mt-1 max-w-[68ch] whitespace-pre-wrap text-sm text-muted">
                {displayText(data.passage)}
              </p>
              {highlight?.partial && (
                <p className="mt-1 text-sm text-muted">
                  This passage runs across more than one page.
                </p>
              )}
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
