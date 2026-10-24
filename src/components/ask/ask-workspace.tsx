"use client";

import { useRef, useState } from "react";
import { AskPanel, type AskDocument, type RestoredConversation, type WireCitation } from "./ask-panel";
import { DocumentsViewer, type ViewerTarget } from "./documents-viewer";

type ConversationListItem = {
  id: string;
  title: string;
  documentIds: string[];
  messageCount: number;
  createdAt: string;
};

/** The Ask screen as two panes plus an activity drawer. On a phone the panes
    become tabs, and opening a citation switches to the viewer tab. The drawer
    lists prior conversations (F7); opening one loads its messages as read-only
    context and reselects the documents it used, when they are still ready. */
export function AskWorkspace({
  documents,
  initialDocumentId,
}: {
  documents: AskDocument[];
  initialDocumentId?: string | null;
}) {
  const [tab, setTab] = useState<"viewer" | "conversation">("conversation");
  const [target, setTarget] = useState<ViewerTarget | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [activeConversation, setActiveConversation] = useState<RestoredConversation | null>(null);
  const loadRef = useRef(0);

  function openCitation(c: WireCitation) {
    if (!c.documentId) return;
    setTarget({
      documentId: c.documentId,
      fileName: c.fileName,
      page: c.pageStart,
      chunkId: c.chunkId,
      quote: c.quote,
      closest: c.closest === true,
    });
    setTab("viewer");
  }

  function browsePage(page: number) {
    setTarget((t) => (t ? { ...t, page } : t));
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
    setDrawerOpen(false);
  }

  async function deleteConversation(id: string) {
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversation?.id === id) {
      setActiveConversation(null);
    }
  }

  function openDrawer() {
    setActiveConversation(null);
    setDrawerOpen(true);
    void loadConversations();
  }

  return (
    <div className="mt-8">
      {/* Phone: one pane at a time. */}
      <div
        className="mb-4 flex gap-2 lg:hidden"
        role="tablist"
        aria-label="Ask screen panes"
      >
        <button
          type="button"
          role="tab"
          id="tab-conversation"
          aria-selected={tab === "conversation"}
          aria-controls="pane-conversation"
          className={`btn ${tab === "conversation" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("conversation")}
        >
          Conversation
        </button>
        <button
          type="button"
          role="tab"
          id="tab-viewer"
          aria-selected={tab === "viewer"}
          aria-controls="pane-viewer"
          className={`btn ${tab === "viewer" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("viewer")}
        >
          Viewer
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 lg:justify-end">
        <button
          type="button"
          className="btn btn-secondary text-sm"
          onClick={openDrawer}
        >
          Activity
        </button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section
          role="tabpanel"
          id="pane-viewer"
          aria-labelledby="tab-viewer"
          className={tab === "viewer" ? "" : "hidden lg:block"}
        >
          <DocumentsViewer target={target} onBrowse={browsePage} />
        </section>

        <section
          role="tabpanel"
          id="pane-conversation"
          aria-labelledby="tab-conversation"
          className={tab === "conversation" ? "" : "hidden lg:block"}
        >
          <AskPanel
            key={activeConversation?.id ?? "fresh"}
            documents={documents}
            onCitation={openCitation}
            initialDocumentId={initialDocumentId}
            initialConversation={activeConversation}
          />
        </section>
      </div>

      {drawerOpen && (
        <section
          className="mt-8 rounded-[6px] border border-border bg-surface p-5"
          aria-label="Previous conversations"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              Previous conversations
            </p>
            <button
              type="button"
              className="link text-sm"
              onClick={() => {
                setDrawerOpen(false);
                setActiveConversation(null);
              }}
            >
              Close
            </button>
          </div>

          {loadingConversations && (
            <p className="mt-3 text-sm text-muted">Loading…</p>
          )}

          {!loadingConversations && conversations.length === 0 && (
            <p className="mt-3 text-sm text-muted">
              No previous conversations yet.
            </p>
          )}

          {!loadingConversations && conversations.length > 0 && (
            <ul className="mt-3 flex flex-col">
              {conversations.map((c, i) => (
                <li
                  key={c.id}
                  className={`flex flex-wrap items-center justify-between gap-2 py-3 ${i < conversations.length - 1 ? "border-b border-border" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold">{c.title || "Untitled conversation"}</p>
                    <p className="font-mono text-sm text-muted">
                      {c.messageCount} message{c.messageCount === 1 ? "" : "s"} ·
                      {new Date(c.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary text-sm"
                      onClick={() => openConversation(c.id)}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary text-sm"
                      aria-label={`Delete conversation ${c.title || "Untitled"}`}
                      onClick={() => {
                        if (window.confirm("Delete this conversation? Its messages will be removed.")) {
                          deleteConversation(c.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
