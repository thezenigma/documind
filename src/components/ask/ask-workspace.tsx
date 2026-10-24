"use client";

import { useState } from "react";
import { AskPanel, type AskDocument, type WireCitation } from "./ask-panel";
import { DocumentsViewer, type ViewerTarget } from "./documents-viewer";

/**
 * The Ask screen as two panes: the document viewer on the left, the
 * conversation on the right (PRD section: Ask with viewer). On a phone the
 * panes become tabs, and opening a citation switches to the viewer tab.
 */
export function AskWorkspace({ documents }: { documents: AskDocument[] }) {
  const [tab, setTab] = useState<"viewer" | "conversation">("conversation");
  const [target, setTarget] = useState<ViewerTarget | null>(null);

  function openCitation(c: WireCitation) {
    if (!c.documentId) return;
    setTarget({
      documentId: c.documentId,
      fileName: c.fileName,
      page: c.pageStart,
      chunkId: c.chunkId,
      quote: c.quote,
    });
    setTab("viewer");
  }

  function browsePage(page: number) {
    setTarget((t) => (t ? { ...t, page } : t));
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
          <AskPanel documents={documents} onCitation={openCitation} />
        </section>
      </div>
    </div>
  );
}
