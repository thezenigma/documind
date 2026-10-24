"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/lib/auth-actions";
import { DocumentsList, type DocumentSummary } from "@/components/library/documents-list";
import { UploadPanel } from "@/components/library/upload-panel";
import { AskPanel, type AskDocument, type RestoredConversation, type WireCitation } from "./ask-panel";
import { DocumentsViewer, type ViewerTarget } from "./documents-viewer";

type ConversationListItem = {
  id: string;
  title: string;
  documentIds: string[];
  messageCount: number;
  createdAt: string;
};

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** The Ask screen as a chat shell: a top bar with the wordmark and sign out, a
    sliding drawer on the left with past conversations and the Library popup,
    a sliding dock on the right that shows a citation's source page, and the
    conversation thread with its sticky composer in the middle. */
export function AskShell({
  documents,
  libraryDocuments,
  supabaseUrl,
  anonKey,
  email,
  initialDocumentId,
}: {
  documents: AskDocument[];
  libraryDocuments: DocumentSummary[];
  supabaseUrl: string;
  anonKey: string;
  email: string;
  initialDocumentId?: string | null;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [target, setTarget] = useState<ViewerTarget | null>(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [activeConversation, setActiveConversation] = useState<RestoredConversation | null>(null);
  // Bumping the nonce remounts the panel so "New chat" style resets really clear.
  const [freshNonce, setFreshNonce] = useState(0);
  const loadRef = useRef(0);
  const drawerTriggerRef = useRef<HTMLElement | null>(null);
  const dockTriggerRef = useRef<HTMLElement | null>(null);
  const libraryTriggerRef = useRef<HTMLElement | null>(null);
  const drawerCloseRef = useRef<HTMLButtonElement | null>(null);
  const dockCloseRef = useRef<HTMLButtonElement | null>(null);
  const libraryCloseRef = useRef<HTMLButtonElement | null>(null);

  // Escape closes the topmost open layer, then the drawer, then the dock.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (libraryOpen) {
        setLibraryOpen(false);
        libraryTriggerRef.current?.focus();
      } else if (drawerOpen) {
        setDrawerOpen(false);
        drawerTriggerRef.current?.focus();
      } else if (dockOpen) {
        setDockOpen(false);
        dockTriggerRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [libraryOpen, drawerOpen, dockOpen]);

  // Move focus into each layer as it opens.
  useEffect(() => {
    if (drawerOpen) drawerCloseRef.current?.focus();
  }, [drawerOpen]);
  useEffect(() => {
    if (dockOpen) dockCloseRef.current?.focus();
  }, [dockOpen]);
  useEffect(() => {
    if (libraryOpen) libraryCloseRef.current?.focus();
  }, [libraryOpen]);

  function openDrawer() {
    drawerTriggerRef.current = document.activeElement as HTMLElement | null;
    setDrawerOpen(true);
    void loadConversations();
  }

  function closeDrawer() {
    setDrawerOpen(false);
    drawerTriggerRef.current?.focus();
  }

  function openCitation(c: WireCitation) {
    if (!c.documentId) return;
    dockTriggerRef.current = document.activeElement as HTMLElement | null;
    setDrawerOpen(false);
    setTarget({
      documentId: c.documentId,
      fileName: c.fileName,
      page: c.pageStart,
      chunkId: c.chunkId,
      quote: c.quote,
      closest: c.closest === true,
    });
    setDockOpen(true);
  }

  function closeDock() {
    setDockOpen(false);
    dockTriggerRef.current?.focus();
  }

  function browsePage(page: number) {
    setTarget((t) => (t ? { ...t, page } : t));
  }

  function openLibrary(trigger: HTMLElement | null) {
    libraryTriggerRef.current = trigger;
    setLibraryOpen(true);
  }

  function closeLibrary() {
    setLibraryOpen(false);
    libraryTriggerRef.current?.focus();
  }

  async function loadConversations() {
    const key = ++loadRef.current;
    setLoadingConversations(true);
    try {
      const res = await fetch("/api/conversations");
      if (!res.ok) throw new Error("Could not load conversations");
      const json = (await res.json()) as { conversations: ConversationListItem[] };
      if (key === loadRef.current) {
        setConversations(json.conversations);
      }
    } catch {
      // Leave the existing list as-is; the drawer keeps the retry affordance.
    } finally {
      if (key === loadRef.current) {
        setLoadingConversations(false);
      }
    }
  }

  async function openConversation(id: string) {
    const res = await fetch(`/api/conversations/${id}/messages`);
    if (!res.ok) return;
    const json = (await res.json()) as RestoredConversation;
    setActiveConversation(json);
    closeDrawer();
  }

  async function deleteConversation(id: string) {
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversation?.id === id) {
      setActiveConversation(null);
      setFreshNonce((n) => n + 1);
    }
  }

  return (
    <>
      {/* Top bar: navigation and account, always visible. */}
      <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] border border-border bg-surface text-muted hover:text-text"
            aria-label="Previous conversations"
            aria-expanded={drawerOpen}
            aria-controls="conversation-drawer"
            onClick={openDrawer}
          >
            <MenuIcon />
          </button>
          <Link href="/" className="wordmark">
            DocuMind
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-sm text-muted sm:inline">{email}</span>
          <form action={logout}>
            <button type="submit" className="btn btn-secondary text-sm">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* One scrim serves both sliding layers; Escape is the keyboard path. */}
        <button
          type="button"
          className="overlay-scrim"
          data-open={drawerOpen || dockOpen}
          aria-label={drawerOpen ? "Close previous conversations" : "Close the citation source"}
          onClick={() => (drawerOpen ? closeDrawer() : closeDock())}
        />

        {/* Left drawer: the Library trigger above the conversation list. */}
        <aside
          id="conversation-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Previous conversations"
          inert={!drawerOpen}
          className={`absolute inset-y-0 left-0 z-40 flex w-[min(19rem,85vw)] flex-col border-r border-border bg-surface shadow-xl transform transition-transform duration-200 ease-out motion-reduce:transition-none ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Conversations</p>
            <button
              type="button"
              ref={drawerCloseRef}
              aria-label="Close previous conversations"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[6px] text-muted hover:text-text"
              onClick={closeDrawer}
            >
              <CloseIcon />
            </button>
          </div>

          <div className="border-b border-border px-4 py-3">
            <button
              type="button"
              className="btn btn-secondary w-full text-sm"
              onClick={(e) => openLibrary(e.currentTarget)}
            >
              Open library
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <p className="text-sm font-semibold">Previous conversations</p>

            {loadingConversations && <p className="mt-3 text-sm text-muted">Loading…</p>}

            {!loadingConversations && conversations.length === 0 && (
              <p className="mt-3 text-sm text-muted">
                No previous conversations yet. Ask a question and it will be saved here.
              </p>
            )}

            {!loadingConversations && conversations.length > 0 && (
              <ul className="mt-1 flex flex-col">
                {conversations.map((c, i) => (
                  <li
                    key={c.id}
                    className={`py-3 ${i < conversations.length - 1 ? "border-b border-border" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-base font-semibold">
                        {c.title || "Untitled conversation"}
                      </p>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          className="btn btn-secondary text-sm"
                          onClick={() => openConversation(c.id)}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className="text-sm font-medium text-error hover:underline"
                          aria-label={`Delete conversation ${c.title || "Untitled"}`}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Delete this conversation? Its messages will be removed.",
                              )
                            ) {
                              deleteConversation(c.id);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 font-mono text-sm text-muted">
                      {c.messageCount} message{c.messageCount === 1 ? "" : "s"} ·
                      {new Date(c.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Center: the conversation thread with its composer. */}
        <div id="ask-thread" tabIndex={-1} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {documents.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
              <h2 className="text-xl">Nothing indexed yet</h2>
              <p className="max-w-[46ch] text-base text-muted">
                Upload a document in your library, wait for it to finish indexing,
                then come back here to ask about it.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={(e) => openLibrary(e.currentTarget)}
              >
                Open your library
              </button>
            </div>
          ) : (
            <AskPanel
              key={activeConversation?.id ?? initialDocumentId ?? `fresh-${freshNonce}`}
              documents={documents}
              onCitation={openCitation}
              initialDocumentId={initialDocumentId}
              initialConversation={activeConversation}
            />
          )}
        </div>

        {/* Right dock: the source page behind a citation, hidden until asked for. */}
        <aside
          id="citation-dock"
          role="dialog"
          aria-modal="true"
          aria-labelledby="citation-dock-title"
          inert={!dockOpen}
          className={`absolute inset-y-0 right-0 z-40 flex w-full flex-col overflow-y-auto border-l border-border bg-background p-4 shadow-xl transform transition-transform duration-200 ease-out motion-reduce:transition-none sm:w-[30rem] lg:w-[34rem] ${
            dockOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <p id="citation-dock-title" className="text-sm font-semibold">
              Citation source
            </p>
            <button
              type="button"
              ref={dockCloseRef}
              aria-label="Close the citation source"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[6px] text-muted hover:text-text"
              onClick={closeDock}
            >
              <CloseIcon />
            </button>
          </div>
          <DocumentsViewer target={target} onBrowse={browsePage} />
        </aside>

        {/* Library popup: upload and manage documents without leaving the chat. */}
        {libraryOpen && (
          <div className="fixed inset-0 z-50 animate-[fade-in_150ms_ease-out] motion-reduce:animate-none">
            <button
              type="button"
              aria-label="Close the library"
              className="absolute inset-0 bg-black/40"
              onClick={closeLibrary}
            />
            <div className="absolute inset-0 grid place-items-center p-4">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="library-popup-title"
                className="flex max-h-[86dvh] w-[min(44rem,100%)] flex-col overflow-hidden rounded-[6px] border border-border bg-surface shadow-2xl"
              >
                <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
                  <h2 id="library-popup-title" className="text-xl">
                    Library
                  </h2>
                  <button
                    type="button"
                    ref={libraryCloseRef}
                    aria-label="Close the library"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-[6px] text-muted hover:text-text"
                    onClick={closeLibrary}
                  >
                    <CloseIcon />
                  </button>
                </div>
                <div className="min-h-0 overflow-y-auto px-5 py-4">
                  <UploadPanel
                    supabaseUrl={supabaseUrl}
                    anonKey={anonKey}
                    onNavigate={closeLibrary}
                  />
                  <DocumentsList documents={libraryDocuments} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
