"use client";

import { Fragment, useRef, useState } from "react";

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
};

type TurnState = "streaming" | "done" | "stopped" | "error" | "limit";

type Turn = {
  id: number;
  question: string;
  answer: string;
  citations: WireCitation[] | null;
  state: TurnState;
  error?: string;
};

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

export function AskPanel({
  documents,
  onCitation,
  initialDocumentId,
}: {
  documents: AskDocument[];
  onCitation?: (c: WireCitation) => void;
  initialDocumentId?: string | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      initialDocumentId && documents.some((d) => d.id === initialDocumentId)
        ? new Set([initialDocumentId])
        : new Set(documents.map((d) => d.id)),
  );
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sectionStarts, setSectionStarts] = useState<number[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const conversationIdRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const nextIdRef = useRef(1);

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
      { id, question: q, answer: "", citations: null, state: "streaming" },
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
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        const message = json.error ?? "The request failed. Try again.";
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
            | { type: "done"; citations: WireCitation[]; conversationId: string | null }
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
            // A document toggle mid-answer starts a new thread; do not let
            // this response carry the old conversation id back in.
            if (generation === generationRef.current) {
              conversationIdRef.current = payload.conversationId;
            }
            patchTurn(id, { citations: payload.citations, state: "done" });
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
    <div className="flex flex-col gap-6">
      <section className="rounded-[6px] border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            Documents ({selected.size} of {documents.length} selected)
          </p>
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
      </section>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && (
          <p className="form-message form-message-error" role="alert">
            {error}
          </p>
        )}
        <label htmlFor="ask-question" className="text-sm font-semibold">
          Your question
        </label>
        <textarea
          id="ask-question"
          className="input min-h-[80px] resize-y"
          rows={3}
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
        <p className="text-sm text-muted">
          Press Enter to ask. Hold Shift and press Enter for a new line.
        </p>
        <div className="flex items-center gap-3">
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
        </div>
      </form>

      {turns.length > 0 && (
        <section className="flex flex-col gap-6">
          {turns.map((turn, index) => {
            const numbers = displayNumbers(turn.answer, turn.citations);
            return (
              <Fragment key={turn.id}>
                {sectionStarts.includes(index) && (
                  <p className="text-sm text-muted">
                    New conversation. Answers below use only the documents
                    selected now.
                  </p>
                )}
                <article className="rounded-[6px] border border-border bg-surface p-5">
                  <p className="text-base font-semibold">{turn.question}</p>

                  {turn.state === "streaming" && turn.answer === "" && (
                    <p className="mt-2 text-muted" role="status">
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
                    <p className="mt-2 text-sm text-muted">Stopped.</p>
                  )}

                  {turn.state === "error" && turn.error && (
                    <p className="form-message form-message-error mt-3" role="alert">
                      {turn.error}
                    </p>
                  )}

                  {turn.state === "limit" && turn.error && (
                    <p className="form-message mt-3" role="alert">
                      {turn.error}
                    </p>
                  )}

                  {turn.citations && (
                    <References citations={turn.citations} numbers={numbers} onCitation={onCitation} />
                  )}
                </article>
              </Fragment>
            );
          })}
        </section>
      )}
    </div>
  );
}
