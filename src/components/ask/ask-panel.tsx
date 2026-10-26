"use client";

import { Fragment, useEffect, useRef, useState } from "react";

export type AskDocument = {
  id: string;
  file_name: string;
  pages: number | null;
};

export type WireCitation = {
  n: number;
  chunkId: string;
  documentId: string;
  fileName: string;
  pageStart: number;
  pageEnd: number;
  quote: string | null;
  verified: boolean;
  /** PRD F6: true on closest-passage entries sent with a refusal. */
  closest?: boolean;
};

type TurnState = "streaming" | "done" | "stopped" | "error" | "limit";

type Turn = {
  id: number;
  question: string;
  answer: string;
  citations: WireCitation[] | null;
  closest: WireCitation[] | null;
  state: TurnState;
  error?: string;
};

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Array<Record<string, unknown>>;
  createdAt: string;
};

function wireFromStored(c: Array<Record<string, unknown>>): WireCitation[] {
  return c
    .filter(
      (r): r is {
        n: number;
        chunkId: string;
        documentId: string;
        fileName: string;
        pageStart: number;
        pageEnd: number;
        quote: string | null;
        verified: boolean;
        closest?: boolean;
      } =>
        typeof r.n === "number" &&
        typeof r.chunkId === "string" &&
        typeof r.documentId === "string" &&
        typeof r.fileName === "string" &&
        typeof r.pageStart === "number" &&
        typeof r.pageEnd === "number" &&
        (r.quote === null || typeof r.quote === "string") &&
        typeof r.verified === "boolean",
    )
    .map((r) => ({
      n: r.n,
      chunkId: r.chunkId,
      documentId: r.documentId,
      fileName: r.fileName,
      pageStart: r.pageStart,
      pageEnd: r.pageEnd,
      quote: r.quote,
      verified: r.verified,
      closest: r.closest === true,
    }));
}

function restoreTurn(m: StoredMessage): Turn {
  const citations = wireFromStored(m.citations);
  const closest = citations.filter((c) => c.closest);
  return {
    id: Number(m.id),
    question: m.role === "user" ? m.content : "",
    answer: m.role === "assistant" ? m.content : "",
    citations: m.role === "assistant" && citations.length > 0 ? citations : null,
    closest: closest.length > 0 ? closest : null,
    state: "done" as const,
  };
}

function pageLabel(c: WireCitation): string {
  if (c.pageStart === 0) return "page not set";
  return c.pageStart === c.pageEnd
    ? `page ${c.pageStart}`
    : `pages ${c.pageStart} to ${c.pageEnd}`;
}

/** The model cites by retrieval rank, which can skip numbers ([1] [3] with no
    [2]). Display numbers are assigned in citations order, then by first
    appearance for any id only the model wrote, so the answer and the
    reference list read [1] [2] while verification keeps the chunk ids. The
    map is append-only as tokens stream, so numbers never reshuffle. */
function displayNumbers(
  text: string,
  citations: WireCitation[] | null,
): Map<number, number> {
  const map = new Map<number, number>();
  let next = 1;
  for (const c of citations ?? []) {
    if (c.n > 0) map.set(c.n, next++);
  }
  for (const match of text.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(match[1]);
    if (n > 0 && !map.has(n)) map.set(n, next++);
  }
  return map;
}

function AnswerText({
  text,
  citations,
  numbers,
  onCitation,
}: {
  text: string;
  citations: WireCitation[] | null;
  numbers: Map<number, number>;
  onCitation?: (c: WireCitation) => void;
}) {
  const byN = new Map((citations ?? []).map((c) => [c.n, c]));
  const parts = text.split(/(\[\d{1,2}\])/g);
  return (
    <p className="mt-2 break-words whitespace-pre-wrap text-base leading-relaxed">
      {parts.map((part, i) => {
        const match = /^\[(\d{1,2})\]$/.exec(part);
        const citation = match ? byN.get(Number(match[1])) : undefined;
        const raw = match ? Number(match[1]) : 0;
        const shown = numbers.get(raw) ?? raw;
        if (citation && citation.documentId && onCitation) {
          return (
            <button
              key={i}
              type="button"
              className="citation-ref font-mono hover:underline"
              aria-label={`Show the passage for citation ${shown} from ${citation.fileName}`}
              onClick={() => onCitation(citation)}
            >
              {`[${shown}]`}
            </button>
          );
        }
        if (match) {
          return (
            <span key={i} className="font-mono text-sm text-accent">
              {`[${shown}]`}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function References({
  citations,
  numbers,
  onCitation,
}: {
  citations: WireCitation[];
  numbers: Map<number, number>;
  onCitation?: (c: WireCitation) => void;
}) {
  if (citations.length === 0) return null;
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="text-sm font-semibold">References</p>
      <ul className="mt-1 flex flex-col gap-1">
        {citations.map((c, i) => {
          const shown = c.n > 0 ? numbers.get(c.n) ?? c.n : null;
          const label = shown ? `[${shown}]` : "[?]";
          return (
            <li key={`${c.n}-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              {c.documentId && onCitation ? (
                <button
                  type="button"
                  className="text-left hover:underline"
                  aria-label={`Show the passage for citation ${shown ?? "?"} from ${c.fileName}, ${pageLabel(c)}`}
                  onClick={() => onCitation(c)}
                >
                  <span className="citation-ref font-mono">{label}</span>
                  {c.fileName}, {pageLabel(c)}
                </button>
              ) : (
                <>
                  <span className="citation-ref font-mono">{label}</span>
                  <span>
                    {c.fileName}, {pageLabel(c)}
                  </span>
                </>
              )}
              <span className={c.verified ? "text-accent" : "text-error"}>
                {c.verified ? "checked" : "unverified"}
              </span>
              {c.quote && !c.verified && (
                <span className="w-full text-muted">
                  Quoted text was not found in that passage.
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** PRD F6: after a refusal, the nearest matches from the search are listed so
    the reader can check what the documents actually contain. */
function ClosestPassages({
  passages,
  onCitation,
}: {
  passages: WireCitation[];
  onCitation?: (c: WireCitation) => void;
}) {
  if (passages.length === 0) return null;
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="text-sm font-semibold">Closest passages found</p>
      <p className="mt-1 text-sm text-muted">
        These were the nearest matches. Open one to check the text.
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {passages.map((c, i) => (
          <li key={c.chunkId || i} className="text-sm">
            {c.documentId && onCitation ? (
              <button
                type="button"
                className="text-left hover:underline"
                aria-label={`Open the closest passage from ${c.fileName}, ${pageLabel(c)}`}
                onClick={() => onCitation(c)}
              >
                {c.fileName}, {pageLabel(c)}
              </button>
            ) : (
              <span>
                {c.fileName}, {pageLabel(c)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export type RestoredConversation = {
  id: string;
  title: string;
  documentIds: string[];
  createdAt: string;
  messages: StoredMessage[];
};

export function AskPanel({
  documents,
  onCitation,
  initialDocumentId,
  initialConversation,
  onDemoRemaining,
}: {
  documents: AskDocument[];
  onCitation?: (c: WireCitation) => void;
  initialDocumentId?: string | null;
  initialConversation?: RestoredConversation | null;
  /** Demo mode: reports the visitor's updated budget after each answer. */
  onDemoRemaining?: (left: number) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => {
      const start = initialConversation?.documentIds[0] ?? initialDocumentId;
      if (start && documents.some((d) => d.id === start)) {
        return new Set(initialConversation?.documentIds.filter((id) => documents.some((d) => d.id === id)) ?? [start]);
      }
      return new Set(documents.map((d) => d.id));
    },
  );
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sectionStarts, setSectionStarts] = useState<number[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [restoredTitle, setRestoredTitle] = useState<string | null>(
    initialConversation ? initialConversation.title : null,
  );
  const [restoredMessages, setRestoredMessages] = useState<Turn[]>(
    initialConversation
      ? initialConversation.messages.map(restoreTurn)
      : [],
  );
  const conversationIdRef = useRef<string | null>(
    initialConversation ? initialConversation.id : null,
  );
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const nextIdRef = useRef(1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);

  // Follow the stream only while the reader is already at the bottom, so
  // scrolling up to check a citation is never yanked back down.
  useEffect(() => {
    if (turns.length + restoredMessages.length === 0) return;
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [turns, restoredMessages]);

  function handleThreadScroll() {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
  }

  // The document picker closes on Escape or a click outside it.
  useEffect(() => {
    if (!pickerOpen) return;
    function onPointer(event: PointerEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pickerOpen]);

  // The parent remounts this panel with a key when the restored conversation
  // changes, so every state above simply initializes from initialConversation.

  const streaming = turns.some((t) => t.state === "streaming");

  // Changing the document set starts a fresh conversation thread. The marker
  // records where the new section begins so the turns already on screen
  // explain the reset instead of reading as one continuous conversation.
  function restartThread() {
    conversationIdRef.current = null;
    generationRef.current += 1;
    setSectionStarts((prev) =>
      turns.length > 0 && prev[prev.length - 1] !== turns.length
        ? [...prev, turns.length]
        : prev,
    );
  }

  function toggleDocument(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    restartThread();
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === documents.length ? new Set<string>() : new Set(documents.map((d) => d.id)),
    );
    restartThread();
  }

  function patchTurn(id: number, patch: Partial<Turn>) {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  /** Continue a conversation from a restored one: keeps the same conversation id
      while the document selection matches, otherwise starts a new thread. */
  function continueFrom(restored: RestoredConversation | null) {
    if (!restored) {
      conversationIdRef.current = null;
      generationRef.current += 1;
      setRestoredTitle(null);
      setRestoredMessages([]);
      return;
    }
    const ids = [...selected];
    const sameSelection = restored.documentIds.length === ids.length &&
      restored.documentIds.every((id) => ids.includes(id));
    conversationIdRef.current = sameSelection ? restored.id : null;
    setRestoredTitle(restored.title);
  }

  async function ask() {
    const q = question.trim();
    if (streaming || status === "Preparing…") return;
    if (q.length < 4) {
      setError("Ask a question of at least 4 characters.");
      return;
    }
    if (selected.size === 0) {
      setError("Choose at least one document.");
      return;
    }
    setError("");
    setQuestion("");
    setStatus("Preparing…");

    const id = nextIdRef.current++;
    const generation = generationRef.current;
    setTurns((prev) => [
      ...prev,
      { id, question: q, answer: "", citations: null, closest: null, state: "streaming" },
    ]);
    setStatus("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          documentIds: [...selected],
          conversationId: conversationIdRef.current ?? undefined,
        }),
        signal: controller.signal,
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || !contentType.includes("text/event-stream")) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          demoRemaining?: number;
        };
        const message = json.error ?? "The request failed. Try again.";
        if (typeof json.demoRemaining === "number") onDemoRemaining?.(json.demoRemaining);
        patchTurn(id, {
          state: res.status === 429 ? "limit" : "error",
          error: message,
        });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream.");
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let finished = false;
      let failed = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let payload:
            | { type: "citations"; citations: WireCitation[] }
            | { type: "token"; t: string }
            | {
                type: "done";
                citations: WireCitation[];
                closest: WireCitation[];
                conversationId: string | null;
                demoRemaining?: number | null;
              }
            | { type: "error"; message: string };
          try {
            payload = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (payload.type === "citations") {
            patchTurn(id, { citations: payload.citations });
          } else if (payload.type === "token") {
            answer += payload.t;
            patchTurn(id, { answer });
          } else if (payload.type === "done") {
            finished = true;
            if (typeof payload.demoRemaining === "number" && generation === generationRef.current) {
              onDemoRemaining?.(payload.demoRemaining);
            }
            // A document toggle mid-answer starts a new thread; do not let
            // this response carry the old conversation id back in.
            if (generation === generationRef.current) {
              conversationIdRef.current = payload.conversationId;
            }
            // Use the verified, stored citation set rather than the initial
            // unverified list, so restored and freshly streamed answers both
            // render the same final references. F7.
            const stored =
              typeof (payload as Record<string, unknown>).storedCitations === "object" &&
              Array.isArray((payload as Record<string, unknown>).storedCitations)
                ? wireFromStored((payload as Record<string, unknown>).storedCitations as Record<string, unknown>[])
                : payload.citations ?? [];
            patchTurn(id, {
              citations:
                stored.filter((c) => !c.closest).length > 0
                  ? stored.filter((c) => !c.closest)
                  : null,
              closest: stored.filter((c) => c.closest),
              state: "done",
            });
          } else if (payload.type === "error") {
            failed = true;
            patchTurn(id, { state: "error", error: payload.message });
          }
        }
      }

      if (!finished && !failed) {
        if (answer) {
          patchTurn(id, { state: "done" });
        } else {
          patchTurn(id, { state: "error", error: "No answer arrived. Try again." });
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        patchTurn(id, { state: "stopped" });
      } else {
        console.error(err);
        patchTurn(id, {
          state: "error",
          error: "The connection was interrupted. Try asking again.",
        });
      }
    } finally {
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void ask();
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Thread: the scrollable conversation, newest at the bottom. */}
      <div
        ref={scrollRef}
        onScroll={handleThreadScroll}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
          {restoredTitle && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-border bg-surface px-4 py-3">
              <p className="text-sm text-muted">Continuing {restoredTitle}.</p>
              <button
                type="button"
                className="link text-sm"
                onClick={() => continueFrom(null)}
              >
                Start fresh
              </button>
            </div>
          )}

          {turns.length === 0 && restoredMessages.length === 0 && !status && (
            <p className="py-8 text-center text-base text-muted">
              Ask a question about the selected documents. Every answer points
              to the page it came from.
            </p>
          )}

          <section className="flex flex-col gap-6">
            {restoredMessages.map((turn) => (
              <Fragment key={`restored-${turn.id}`}>
                {turn.question && (
                  <div className="flex justify-end">
                    <p className="max-w-[85%] rounded-[6px] border border-border bg-surface px-4 py-2 text-base font-semibold">
                      {turn.question}
                    </p>
                  </div>
                )}
                {turn.answer && (
                  <div className="flex flex-col gap-2">
                    <AnswerText
                      text={turn.answer}
                      citations={turn.citations}
                      numbers={displayNumbers(turn.answer, turn.citations)}
                      onCitation={onCitation}
                    />
                    {turn.closest && turn.closest.length > 0 && (
                      <ClosestPassages passages={turn.closest} onCitation={onCitation} />
                    )}
                    {turn.citations && !turn.closest && turn.citations.length > 0 && (
                      <References
                        citations={turn.citations}
                        numbers={displayNumbers(turn.answer, turn.citations)}
                        onCitation={onCitation}
                      />
                    )}
                  </div>
                )}
              </Fragment>
            ))}
            {turns.map((turn, index) => {
              const numbers = displayNumbers(turn.answer, turn.citations);
              return (
                <div key={turn.id} className="flex flex-col gap-3">
                  {sectionStarts.includes(index) && (
                    <p className="text-sm text-muted">
                      New conversation. Answers below use only the documents
                      selected now.
                    </p>
                  )}
                  <div className="flex justify-end">
                    <p className="max-w-[85%] rounded-[6px] border border-border bg-surface px-4 py-2 text-base font-semibold">
                      {turn.question}
                    </p>
                  </div>

                  {turn.state === "streaming" && turn.answer === "" && (
                    <p className="text-muted" role="status">
                      Writing an answer…
                    </p>
                  )}

                  {turn.answer && (
                    <AnswerText
                      text={turn.answer}
                      citations={turn.citations}
                      numbers={numbers}
                      onCitation={onCitation}
                    />
                  )}

                  {turn.state === "stopped" && (
                    <p className="text-sm text-muted">Stopped.</p>
                  )}

                  {turn.state === "error" && turn.error && (
                    <p className="form-message form-message-error" role="alert">
                      {turn.error}
                    </p>
                  )}

                  {turn.state === "limit" && turn.error && (
                    <p className="form-message" role="alert">
                      {turn.error}
                    </p>
                  )}

                  {turn.state === "done" && turn.closest && turn.closest.length > 0 && (
                    <ClosestPassages passages={turn.closest} onCitation={onCitation} />
                  )}

                  {turn.citations && (
                    <References citations={turn.citations} numbers={numbers} onCitation={onCitation} />
                  )}
                </div>
              );
            })}
          </section>
        </div>
      </div>

      {/* Composer: pinned to the bottom of the shell. */}
      <div className="border-t border-border bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6">
          {error && (
            <p className="form-message form-message-error mb-3" role="alert">
              {error}
            </p>
          )}

          {/* Document selection, collapsed into a chip that opens upward. */}
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              className="btn btn-secondary text-sm"
              aria-expanded={pickerOpen}
              aria-controls="doc-picker"
              onClick={() => setPickerOpen((v) => !v)}
            >
              Documents · {selected.size} of {documents.length} selected
            </button>
            {pickerOpen && (
              <div
                id="doc-picker"
                className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-[6px] border border-border bg-surface p-4 shadow-xl"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Choose documents</p>
                  {documents.length > 1 && (
                    <button type="button" className="link text-sm" onClick={toggleAll}>
                      {selected.size === documents.length ? "Clear all" : "Select all"}
                    </button>
                  )}
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  {documents.map((doc) => (
                    <label key={doc.id} className="flex cursor-pointer items-center gap-2 py-1 text-base">
                      <input
                        type="checkbox"
                        checked={selected.has(doc.id)}
                        onChange={() => toggleDocument(doc.id)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      <span>
                        {doc.file_name}
                        {doc.pages ? ` (${doc.pages} ${doc.pages === 1 ? "page" : "pages"})` : ""}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="ask-question" className="sr-only">
                Your question
              </label>
              <textarea
                id="ask-question"
                className="input min-h-[64px] resize-y"
                rows={2}
                placeholder="What does the probation policy say?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask();
                  }
                }}
              />
            </div>
            {streaming ? (
              <button type="button" className="btn btn-secondary" onClick={stop}>
                Stop
              </button>
            ) : (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={status === "Preparing…"}
              >
                {status === "Preparing…" ? "Preparing…" : "Ask"}
              </button>
            )}
          </form>
          <p className="mt-2 hidden text-sm text-muted sm:block">
            Press Enter to ask. Hold Shift and press Enter for a new line.
          </p>
        </div>
      </div>
    </div>
  );
}
