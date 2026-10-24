---
project: DocuMind
surface: Library, Ask (conversation + passage viewer)
date: 2026-10-24
overall: strong system discipline, one credibility-breaking highlight defect
milestone: verify after F1-F5 (Impeccable critique + audit)
---

# Critique: Library and Ask screens, milestone verify after F5

Two isolated assessments ran independently: Assessment A (design review, no
detector access) and Assessment B (detector and browser evidence). This file
merges both into the milestone fix list.

## Verdict

The build is heading toward a professional product: design system compliance is
real, state copy is above average, and the citation trust layer is genuinely
designed. The single biggest risk is the one thing the product sells. In the
passage viewer the highlight lands on the document title and greeting instead
of the cited sentence, so the verification moment points at the wrong text.
That, the citation numbering gap, and the three inconsistent container widths
are the credibility set for this milestone.

## Strengths

- Palette and type execute the PRD tokens exactly in both modes; no blue or
  purple anywhere across nine captures; Fraunces, Source Sans 3, and JetBrains
  Mono all doing their jobs.
- Plain-language state copy throughout ("Writing an answer...", "The connection
  was interrupted. Try asking again."), sentence case, no emojis, no em dashes.
- Trust layer: inline citation buttons, References with file, pages, and a
  checked/unverified label, an explanatory sentence when quote verification
  fails.
- States exist everywhere: streaming with Stop, error with role=alert, quota
  limit, determinate upload progress with real stage names and Cancel,
  viewer loading/error/retry, teaching empty states.
- Accessibility scaffolding: skip links, real tablist semantics, aria-labeled
  citation buttons, visible focus rings, reduced motion honored. Lighthouse
  100/100/100 on this build, 47 audits passed, 0 failed.
- Mobile citation flow works: clicking a citation switches to the Viewer tab.
- Detector scan of all changed UI files produced exactly one slop finding.

## Problems

### Critical

1. **Highlight targets the wrong text.** Clicking citation [1] on the probation
   answer highlights "Northwind Employee Handbook / Welcome to Northwind."
   instead of the probation sentence (viewer-1280/800/375.png;
   documents-viewer.tsx locateHighlight fallback ladder). Cause: the chunk
   spans pages 1-3 while the viewer loads only page 1, so the full-passage
   candidate cannot match and the first-sentence fallback fires. The hard
   newlines from PDF extraction also defeat quote matching across line breaks.
   User impact: the moment that proves the product works instead misleads.

### Major

2. **Three container rails.** Header max-w-6xl (layout.tsx:41), Library
   max-w-3xl centered (library/page.tsx:29), Ask max-w-7xl (ask/page.tsx:25).
   Three left edges at 1280w; the Ask H1 starts left of the brand.
3. **Citation numbering gap.** Answer shows [1] [3] with no [2] because
   numbering follows retrieval rank, not citation order (ask-answer-1280.png).
   Reads like a missing reference in an app whose pitch is nothing hidden.
4. **Delete destroys data with one click, no confirmation**
   (documents-list.tsx:95-100).
5. **Duplicate page fetch.** Two identical GET /api/documents/:id/page/:n per
   citation open (network log).
6. **Side-tab border on .form-message** (globals.css:166): border-left 3px
   solid, recolored by status modifiers. Detector slop finding; the craft floor
   refuses colored border-left above 1px on alerts outright.

### Minor

7. **Upload dead-ends after success** (upload-panel.tsx:232-241): shows
   "Indexed and ready" but PRD flow 3 says the Ask view opens on that document.
8. **Drag-and-drop is invisible**: drop handler exists, no hint copy
   (upload-panel.tsx:171-179).
9. **Hard line breaks in page text** render mid-sentence
   (documents-viewer.tsx:215 whitespace-pre-wrap), reads as a rendering bug.
10. **Document-set change silently resets the thread**
    (ask-panel.tsx:153-169); old turns stay on screen, follow-up arrives
    without context.
11. **Citation marker spacing asymmetric** (globals.css:183-189): double gap
    before [3], markers float from the sentence baseline.

### Polish

12. PRD motion table's 200ms highlight fade-in is not implemented.
13. Enter-to-submit undiscoverable; no helper text.
14. Sign out carries weight equal to primary navigation on every screen.
15. Adjacent highlight bands on title and greeting (resolves when 1 is fixed).

## Evidence bugs (this run, not the product)

- `library-1280-light.png` was overwritten with an Ask capture by a retry;
  re-captured during the fix pass.
- An earlier 500 on a CSS chunk was a stale-server-after-rebuild artifact;
  after a clean restart the console is empty and every request is 200.

## Changes for this build (the fix list)

Closed on 2026-10-24. All thirteen items implemented and verified live on the
production build; details in docs/decisions.md.

1. Sentence-level highlight matching with an honest out-of-page note
   (medium; documents-viewer.tsx, possibly the page route).
2. Display-sequential citation numbering (small; ask-panel.tsx parse layer,
   verification keeps chunk ids).
3. One container rail across header, Library, Ask (small; layout.tsx,
   library/page.tsx, ask/page.tsx).
4. Two-step inline delete confirmation (small; documents-list.tsx).
5. Deduplicate the page fetch (small; documents-viewer.tsx).
6. Replace the side-tab border on .form-message (small; globals.css).
7. Upload done state gets "Ask a question about it" (small; upload-panel.tsx).
8. "Or drop the file here" hint (small; upload-panel.tsx).
9. Collapse single newlines in viewer display, keep blank-line paragraphs
   (small; documents-viewer.tsx).
10. Thread-reset divider when selection changes (small; ask-panel.tsx).
11. Citation marker symmetric spacing (small; globals.css).
12. 200ms highlight fade with reduced-motion off-switch (small; globals.css).
13. "Press Enter to ask" helper (small; ask-panel.tsx).

Deferred with reasons: sign-out/nav hierarchy waits for the real app nav that
F7-F8 introduce; the cited-passage box stays even when the chunk equals the
page because it is the PRD's citation source affordance; keyboard/screen-reader
traversal, reduced-motion streaming, and a real 50-page document run belong to
the full Day-8 verify milestone.

## Audit (Assessment B) summary

- Lighthouse on /ask: accessibility 100, best practices 100, SEO 100,
  agentic browsing 100; 47 passed, 0 failed.
- Console empty after clean restart; all non-static requests 200.
- Interaction run verified end to end: sign-in, multi-select, streamed answer
  with verified citations, citation click opens the right document and page,
  pagination states correct, tab switchover below lg, both palettes correct.
- Evidence gaps for Day-8 verify: keyboard-only traversal, screen-reader
  semantics beyond labels, reduced-motion streaming behavior, a real 50-300
  page document, error/empty states not exercised this run.
