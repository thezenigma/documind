# Infrastructure decisions

Recorded 2026-10-24. These are the infrastructure choices confirmed with the owner before the build. Design decisions live in a separate design-decisions.md (created during the design intake step).

## AI provider: NVIDIA NIM

Key lives in server environment only (NVIDIA_API_KEY in .env.local, never committed).

Verified against the live API on 2026-10-24 with this account:

| Role | Model | Notes |
|---|---|---|
| Default chat (fast) | nvidia/nemotron-3.5-lightning-30b-a3b | Must send chat_template_kwargs.enable_thinking = false, otherwise it returns only reasoning content. 535ms for a small prompt with thinking off. |
| Strong chat (multi-passage questions) | nvidia/nemotron-3-ultra-550b-a55b | Works with thinking off. |
| Embeddings | nvidia/nemotron-3.5-embed-1b | 2048 dimensions. Asymmetric: requires input_type = passage when indexing and input_type = query when searching. |

Model names are read from configuration, as the PRD requires, so they can change without code edits.

Gated on this account (HTTP 404), do not use: nvidia/nemotron-3-super-120b-a12b, nvidia/llama-3.1-nemotron-70b-instruct, nvidia/nemotron-4-340b-instruct.

## Database and storage: Supabase

- Project name: documind, region ap-southeast-1 (Singapore), id xrfpxtpjqhdfykmwolbv, cost confirmed at 0 USD per month (free tier).
- Postgres with pgvector for chunk embeddings. Vector column size is 2048 to match the embedding model.
- Supabase Storage for uploaded files. The browser uploads directly to storage so the Vercel request body limit never applies, and the server verifies type and size after registration.
- The service role key is not exposed by the management tooling, so the owner adds SUPABASE_SERVICE_ROLE_KEY from the Supabase dashboard.

## Deployment: Vercel for the whole app

Confirmed with the owner: the frontend and the backend both run on Vercel (Next.js server routes for upload registration, streaming ask, ingestion, billing webhooks), Supabase holds the database and storage, and NVIDIA holds the models.

Render.com is not part of the initial architecture. It comes back only as a background worker if ingestion jobs ever exceed what Vercel functions can run. The owner performs the final Vercel deployment after local testing passes.

## Repository workflow

- Public repository, created on 2026-10-24 as thezenigma/documind, because the PRD definition of done requires a public repo.
- Push after each feature is built and tested. No untested work on the remote.
- Secrets never enter the repository. .env* is gitignored and .env.example carries the shape only.

## Design skill routing

The PRD section 11 assigns Taste the direction step, but the repository DESIGN.md says an existing DESIGN.md means the direction is already decided. DESIGN.md wins on conflict, so Taste does not run a direction step. The design-decisions.md file records the decisions inherited from PRD section 11 instead.

## Auth: Next.js built-in pattern instead of Auth.js

Confirmed with the owner on 2026-10-24. The PRD section 8 specified Auth.js with database sessions, but two facts contradicted that: the Auth.js credentials provider does not persist sessions in the database (it uses JWT cookies), and the Auth.js project is now frozen (absorbed into Better Auth, still published under a beta tag). The owner chose the Next.js official pattern instead:

- Sessions are rows in Postgres (public.sessions, 30-day expiry). The cookie holds a jose-signed session id, so deleting rows ends sessions immediately (logout, password reset, account deletion).
- Server actions for signup, login, logout, resend verification, password reset. Optimistic cookie check in src/proxy.ts (Next 16 renamed middleware to proxy), authoritative session check in src/lib/dal.ts.
- Passwords hashed with bcryptjs. One-time tokens stored as SHA-256 hashes in public.auth_tokens (verify_email 24h, reset_password 1h).
- Email verification before upload is enforced once uploads exist; the DAL already exposes emailVerified.
- Email is pluggable: EMAIL_API_KEY (Resend-compatible) sends real mail; without it the server logs the link (preview mode). A real provider key is still needed before launch.

## Email provider: Resend

- Key added on 2026-10-24 and verified with a live send to the owner's inbox.
- Caveat: while the Resend account has no verified sending domain, Resend accepts sends only to the account owner's own address and rejects anything else with a validation error. Production signups from other people need a verified domain (Resend dashboard, Domains) or a different from address.
- Auth actions treat provider rejection as a normal failure: sign-up still creates the account and the check-email page explains that the email could not be sent and offers a resend, instead of crashing the request.

## Schema notes

- Migration core_schema creates all PRD section 8 tables plus sessions, auth_tokens and rate_limits, with a public.check_rate_limit function (fixed window, atomic in the database so limits hold across server instances).
- Embeddings are stored as halfvec(2048) with an HNSW index: pgvector caps vector indexes at 2000 dimensions, halfvec supports 4000, and fp16 precision does not change top-k retrieval.
- Row level security is enabled on all eleven tables with no policies. Owner decision 2026-10-24. Enforcement was verified through the public Data API with a probe table: the anon key can no longer see existing rows (reads return empty), and insert, update and delete all fail or match zero rows. The service role key bypasses RLS and is the only key the app accepts; src/lib/db.ts fails fast when it is missing, because an anon fallback would now read empty results silently.

## Heading font: Fraunces replaces Newsreader

- Owner decision 2026-10-24: Newsreader read too close to Claude's brand serif, so headings now use Fraunces (warm old-style serif, variable, self-hosted with next/font). Source Sans 3 and JetBrains Mono unchanged.

## Document upload and ingestion (F3)

- Upload flow: the server registers the document row and returns a storage signed upload URL; the browser writes the file straight to Supabase Storage with an XMLHttpRequest PUT, so Vercel's 4.5 MB request body limit never applies. Progress comes from xhr.upload.onprogress. The signed token binds bucket, path and a two hour expiry, so the storage bucket needs no policies at all: anon has zero access to storage.objects, and the only write path is a server-issued token.
- Signed upload endpoint gotcha: the URL must include the bucket segment, PUT /storage/v1/object/upload/sign/<bucket>/<path>?token=..., exactly as @supabase/storage-js builds it. Omitting the bucket (or using POST) produces misleading gateway errors such as "new row violates row-level security policy" and "Invalid signature". The official uploadToSignedUrl method uses PUT; the app mirrors it to keep xhr progress events.
- Ingestion runs synchronously in POST /api/documents/[id]/ingest (maxDuration 300): read from storage, extract text, chunk, embed in batches of 24, insert, mark ready. PRD target is a 50 page PDF in under 60 seconds; the Render worker stays the fallback if Vercel function limits ever get in the way.
- Text extraction: unpdf (pdf.js) for PDFs with real page numbers, mammoth for docx, direct read for txt and md. docx and plain text have no fixed pagination, so chunks carry page 1 and documents store the extracted page estimate.
- Chunking: paragraph aware, target around 1800 characters (roughly 450 tokens), hard split at sentence boundaries above 2600 characters with 120 characters of overlap, first short heading line becomes the section title. Page start and end are preserved across paragraph merges.
- Status flow uploading, reading, splitting, indexing, ready, failed is updated as each stage completes; the upload panel polls a small status endpoint every two seconds while indexing runs, and the library list polls router.refresh every 2.5 seconds while any document is transitional (capped at six minutes).
- Quotas start now instead of waiting for F4: free plan 3 documents per month, checked in the upload registration action against documents.created_at within the UTC month. Failed documents count toward the quota; deleting one frees the slot.
- File type and size are checked in the registration action (extension allowlist, 25 MB) and re-checked server side at ingest (magic bytes for pdf and docx, byte length). Scanned or image only PDFs fail with an honest message that says OCR is needed.
- Next 16 notes: export const runtime = "nodejs" is incompatible with cacheComponents (Node is the default runtime, drop the export). The library page uses export const instant = false: with cacheComponents, a session gated page that reads cookies outside Suspense either fails the build or, inside Suspense, gets speculatively prerendered without cookies and poisons the session lookup, leaving the page stuck on its fallback. A blocking route renders per request and avoids both.
- Test fixtures: scripts/make-test-files.js generates a three page PDF with known sentences per page (pdfkit, dev dependency), a minimal docx built with a small store-only zip writer (PowerShell Compress-Archive writes backslash entry names, which the zip spec forbids and mammoth rejects), plus a markdown and a text file. Generated files are gitignored.
- E2E results on the production build: all four formats uploaded through the browser, ingested and reached ready with correct pages and embeddings (halfvec) in the database; rejected wrong extensions, hit the monthly quota message, deleted a document and freed the quota slot, and confirmed the storage object was removed on delete. A malformed docx failed cleanly with the plain language error shown in the UI.
- Test account kept for the retrieval milestones: f3.test@example.com (verified) with three ready documents: handbook.pdf (3 pages), summary.docx, readme.txt.

## Question answering (F4)

- Route: POST /api/ask streams server-sent events (citations, token*, done|error) over a ReadableStream. The client renders tokens as they arrive and keeps the final references from the done frame. First token measured locally at 382 ms, against the PRD target of under 3 seconds p90.
- Retrieval: hybrid search implemented in one SQL function, public.match_chunks. Vector similarity (halfvec cosine, HNSW) and keyword search (plainto_tsquery against the generated search_tsv column, GIN) each rank the top 20 within the user's ready documents, merged with reciprocal rank fusion (k = 60), top 8 passages returned. The query embedding is sent as a JSON string and cast to halfvec by PostgREST.
- Model choice per PRD section 7: NVIDIA_CHAT_MODEL_FAST (nemotron-3.5-lightning-30b-a3b) by default, NVIDIA_CHAT_MODEL_STRONG (nemotron-3-ultra-550b-a55b) when the question carries an explicit cross-cutting signal (compare, overall, summarize and similar words), or retrieval spans 5+ pages, or 4+ documents. An earlier rule that switched on 2+ selected documents always chose the large model, since selecting everything is the default; the heuristic was narrowed after testing. Model names come from environment configuration. All chat calls send chat_template_kwargs enable_thinking false, temperature 0.2, max_tokens 1024, stream true.
- System prompt follows PRD section 7: answer only from the passages, cite bracketed passage ids after every factual claim, quote sparingly, treat document text as data and never as instructions, refuse plainly when the passages do not answer, and write plain prose without markdown (the model otherwise emits asterisks and bullets that render raw).
- Citation verification runs after generation: every cited id must exist in the retrieved set, and quoted spans are attributed to the nearest preceding citation and checked against that passage's normalized text. Failures are stored as verified false in messages.citations and logged with a usage_events row of kind citation_flagged for the admin view (F14). The interface labels entries checked or unverified and never presents an unchecked citation as checked.
- Conversation threading: the done frame returns a conversationId; the client reuses it while the document selection is unchanged, and the route loads the last six messages (capped at 1500 characters each) as context for follow-ups. Changing the selection starts a new conversation, which stores its document_ids per the PRD data model.
- Quotas enforced server side: free 30 questions per day, pro 500 per day, through the existing rateLimit helper with key ask:<user id>, window 86400, returning HTTP 429 with a plain message.
- Persistence: conversation row plus user message are written before streaming; the assistant message with its citations and a usage_events row (estimated tokens, chars divided by 4) are written after the stream completes. A client abort closes the stream without writing a partial answer.
- Chunking aligned with PRD section 7 during this milestone: target 2400 characters (about 600 tokens), hard limit 3200 (about 800 tokens), overlap 320 characters (about 80 tokens) carried between chunks, including into the first piece after a hard split. The F3 build used a smaller 450-token target; the shipped fixtures produce identical chunks either way because they sit under the target size.
- The library and ask pages both use export const instant = false. A speculative prefetch of /ask still logs one harmless [dal] session lookup failure in the server log; the real request renders correctly.
- E2E results on the production build: streamed answer citing the right page, single-citation references after done, follow-up reuse (one conversation with four messages in the database), plain refusal ("I could not find it in the selected documents") with no references, strong model selected for a compare question, fast model for everything else, usage_events rows with token counts, zero console errors.

## Provider request pacing (40 rpm budget)

- The owner set the provider budget at 40 requests per minute and asked for internal pacing only: no user-facing rate messages, just slower starts when requests arrive fast. 60000/40 = 1500 ms between every provider request start.
- src/lib/provider-gate.ts holds one FIFO promise chain per server process. Both embeddings (nvidia.ts) and chat (chat.ts) acquire a slot before fetching; the slot resolves at request start, so a streaming completion never blocks the queue, only starts are spaced. Waiters run in arrival order, which absorbs parallel tabs and ingestion loops alike.
- If the provider still answers 429, the caller reports pressure: all starts pause for a 10 second cooldown and the request retries once. The retry loop lives inside the provider callers, so routes never surface it.
- NVIDIA_RPM (default 40) is set in .env.example and .env.local. Every start logs an ISO timestamp with the wait time, so pacing is observable: [provider-gate] lines show 1500-1554 ms start-to-start spacing under a 4-way parallel burst, and all four concurrent asks completed.
- Cost: the embed and chat starts of a single ask are now spaced, which moved first-token latency from about 0.4 s to 2.6 s sequential, still inside the PRD target of under 3 seconds p90. A 24-batch embedding loop adds about 1.5 s per extra batch during ingestion.
- The gate is per process. On one Vercel instance it holds to the minute; coordinating many cold instances would need a shared database token bucket (the rate_limits table already exists for that pattern). Portfolio traffic is not expected to need it; recorded here as the known limit.

## Passage viewer (F5)

- New table document_pages (document_id, page_number, text, primary key; FK on delete cascade; RLS enabled with no policies, service role only). Ingestion now writes every extracted page next to the chunks, with a [ingest] done log line carrying page, chunk and total millisecond counts for the under-60-second target.
- Route GET /api/documents/:id/page/:n returns the page text plus totalPages, owner-scoped, ready documents only. An optional ?chunk=<uuid> returns the cited passage text so the viewer can locate the highlight without trusting the client. Unknown documents and out-of-range pages answer 404, invalid numbers 400, signed-out callers 403.
- Documents ingested before page storage existed are backfilled on first page request: download from storage, extract, insert all pages, then serve. Handled inline in the route (log line [page] backfilled N pages) instead of a separate migration script, so old fixtures and any pre-launch document keep working.
- Layout: the ask screen is now a two-pane workspace (src/components/ask/ask-workspace.tsx), viewer left and conversation right at the lg breakpoint, tabbed below it (Conversation/Viewer) on phones with proper tablist/tab/tabpanel roles. Opening any citation switches to the viewer tab. The browser under test renders at 800 px, so the tabs path was verified live and the desktop grid by class review (lg:grid-cols-2); Lighthouse accessibility scored 100 on the new screen.
- Highlighting: page text is normalized (lowercase, collapsed whitespace) with an index map back to the original string, so a normalized match returns an exact character range to wrap in mark.evidence. Candidates are tried most specific first: quoted span, full cited passage, opening sentence (40 to 400 characters to a boundary). The mark is scrolled into view with scrollIntoView block center, which is instant and therefore reduced-motion safe. When no candidate is found on the page (citation spanning several pages), the page renders unmarked and the cited passage is still listed under Cited passage below the text.
- Citations are clickable everywhere they appear: inline [1] markers in the streamed answer and each reference row, both as real buttons with aria-labels naming the citation and file. Citations without a document (unknown passage entries) stay plain text. Answer and page text use break-words so long tokens cannot overflow; reading width is capped at 68ch per the PRD type scale.
- Page browsing (previous/next) flows through the workspace so the view is a single source of truth; loading state is derived from a request key mismatch instead of state writes inside effects, which satisfies the React set-state-in-effect lint rule. Errors keep the pane usable with a Try again button that refetches.
- Web interface guidelines review applied to the changed files: all loading and pending labels now end with a single ellipsis character across ask, upload and auth (the ask status sentinel string changed together with its comparisons), skip links to main added on ask and library, touch-action manipulation on interactive elements. Kept deliberately: sentence-case copy (the PRD copy rules govern over title case), viewer state not mirrored into the URL (not a PRD requirement), placeholder kept as a complete example question.
- Citation compliance: one F5-era answer arrived with no bracketed id at all (model drift; the pipeline stored zero citations honestly). System rule 2 was tightened to demand the bracketed number at the end of every factual sentence and that the answer is not finished without them; the follow-up test cited correctly again.
- E2E on the production build: citation click loads handbook page 1 with the opening sentence highlighted and scrolled into view, previous/next walks real page content with the cited passage box retained, reference-row click reopens the passage, backfill served the pre-change fixture (3 rows written, then a fresh readme upload proved ingest-time writes with stored_pages 1), edge routes answered 400/404/404 authenticated and 403 signed out, zero console errors.

## lint:design and milestone critique pass (after F5)

- lint:design added as prd.md requires: scripts/lint-design.js (plain Node, scans src/) fails on em dashes, lucide icon imports, backdrop-filter, radial gradients, banned font names (Inter, Geist, Space Grotesk), sparkle glyphs, transitions inside hover rules, and saturated blue/purple hues (250 to 320 degrees). Wired as npm run lint:design and prepended to npm run build, so a violation fails the build. The script self-tested: a probe file fires all eight rules, the real source is clean.
- Impeccable critique ran as two isolated assessments (design review first, detector and browser evidence second), merged into docs/critiques/2026-10-24-f1-f5-library-ask.md with the fix list. Detector found exactly one slop pattern: the 3px left border on .form-message.
- Fix list closed on 2026-10-24 (13 items, all verified live on the production build):
  - Highlight targeting rebuilt in documents-viewer.tsx. The old ladder (quote, full passage, first sentence) fell through to the first sentence whenever the cited chunk spanned past the visible page, so the mark landed on the document title. New ladder: quoted span, full passage when it fits the page, then the merged range of every sentence of the passage that appears on the page, tagged partial. When partial, the viewer says This passage runs across more than one page under the Cited passage box. Verified: the probation sentence is now inside one contiguous band.
  - Citation numbers renumbered for display in ask-panel.tsx (displayNumbers): the model cites by retrieval rank, which skips numbers ([1] [3]). Display numbers assign in citations order then first appearance for stray ids, append-only while streaming so numbers never reshuffle; aria-labels use the display number; server verification keeps chunk ids.
  - One container rail: library and ask moved to max-w-6xl to match the header; landing and auth stay centered compositions on purpose.
  - Two-step delete in documents-list.tsx: the first Delete reveals Delete this document? with Delete and Cancel; the confirm button autofocuses, Cancel restores the row.
  - Page fetch deduplicated with a session cache keyed by URL in documents-viewer.tsx (page text is immutable after ingest; failures evict so retry refetches). Verified: one network request per citation open, down from two.
  - .form-message side-tab removed: full 1px border with green or red border and text by modifier (the detector and the craft floor both refuse a colored border-left above 1px on alerts).
  - Upload done state gained a primary Ask a question about it link to /ask?document=<id>; the ask panel preselects only that document (searchParams, awaited Promise per this Next version). Satisfies PRD user story 3.
  - Or drop the file here hint under the file input.
  - Page text renders as flowing paragraphs: single extraction newlines collapse to spaces, blank lines stay paragraph breaks, on the same string the highlighter indexes.
  - Thread reset is announced: changing the document selection records a section boundary and renders New conversation. Answers below use only the documents selected now. A generation counter stops a mid-stream toggle from resurrecting the old conversation id.
  - Citation markers use symmetric margin-inline; the evidence mark fades in over 200ms (expo-out curve), both animations disabled under prefers-reduced-motion.
  - Press Enter to ask helper under the question field.
- Verify results after fixes: Lighthouse accessibility 100 (47 passed, 0 failed), console empty, all requests 200, sequential [1] [2] citations with matching aria-labels, divider visible after a toggle plus a second ask, delete confirm and cancel both work, re-upload reached the done state, the Ask link opened /ask with only the new document checked, light and dark palettes correct at 1280, 800 and 375.
- Deferred with reasons: sign-out and nav hierarchy wait for the real app nav in F7 to F16; the Cited passage box stays for single-chunk pages because it is the PRD citation affordance; keyboard-only traversal, screen-reader depth, reduced-motion streaming and a real 50-page document run belong to the Day-8 verify milestone.

## Structured refusal (F6)

- PRD F6: the refusal must say the documents do not contain the answer and show the closest passages found. The plain refusal copy already existed from F4; this milestone adds the closest passages half.
- The done frame now carries a closest array, built server side only when the answer cites nothing: the top four retrieved passages as records with n 0, verified false and closest true. Refusal turns also store those records in messages.citations so a restored conversation (F7) can rebuild the section.
- The panel renders a Closest passages found block under a refusal turn with one muted line (These were the nearest matches. Open one to check the text.) and ranked, clickable rows. Rows reuse the citation click path, so the workspace opens the viewer at the passage.
- The viewer labels its source box Closest passage when the target came from a refusal and Cited passage for real citations (target.closest flag through the workspace), so a candidate is never presented as a citation.
- Streaming references made truthful: the initial citations frame marked every retrieved passage verified true, so during streaming the list read checked before any verification ran. The initial frame now sends verified false (unverified in the interface) and the done frame replaces it with the cited set and its real labels.
- E2E on the production build: asked What is the office address in Tokyo? against the three fixtures. The model refused with I could not find it in the selected documents., no References section appeared, and Closest passages found listed handbook.pdf pages 1 to 3, readme.txt page 1 and summary.docx page 1 in retrieval order. Opening a closest row loaded the right page with the Closest passage label, the passage run highlighted, one page request, and the tab switch worked at 375 px. Console empty at every width.

## Conversation history (F7)

- PRD F7: list prior conversations per document set, restore one after a reload, delete it. The ask screen gained an Activity button that opens an inline drawer (no modal, no backdrop blur per lint:design) listing conversations newest first with title, message count and date in the library index style.
- Three new routes, all owner-scoped and UUID-validated: GET /api/conversations lists with an embedded messages(count) aggregate (the raw SQL subquery form PostgREST rejects, caught live and fixed); GET /api/conversations/[id]/messages returns the conversation with its document ids and chronological stored citations; DELETE /api/conversations/[id] removes it. The delete route verifies ownership first, then removes messages explicitly rather than trusting an FK cascade the remote schema may not have.
- Restoring a conversation remounts AskPanel with a key (activeConversation.id) so every state initializer re-runs from initialConversation; the earlier useEffect-sync approach was removed because it called setState synchronously inside an effect, which eslint flags and which races the remount anyway. The panel shows Continuing <title>. with a Start fresh control, and reopening a conversation with a different document selection reuses the stored document ids.
- Follow-ups in a restored thread append to the same conversation: the panel keeps conversationIdRef from the restored id and the server extends history from the last six stored messages.
- Refusal turns restore their closest passages (F6 stored them as closest: true records), so a reopened refusal still offers the candidate rows and the viewer still labels the box Closest passage.
- Verified live on the production build: drawer lists conversations with counts and dates; Open restores the question, refusal text and closest-passage rows with the Continuing header; a follow-up streamed a real answer and appended as message four of the same conversation; restored closest row opened the viewer at handbook pages 1 to 3 with the Closest passage label and highlight; delete removed the row and the server record (confirmed by refetch); console empty throughout.
- Known edge recorded for the eval pass: when the model answers with facts but omits bracketed markers, verification finds nothing citable and the turn falls back to the closest-passages presentation. Prompt rule 2 already demands markers; this is model reliability, not a code path bug.
- Visual refinement in the same pass: library rows and conversation rows moved to the index style (single bottom border, semibold title, JetBrains Mono metadata, quiet error-colored Delete with hover underline), H1s stepped up to text-3xl with text-wrap balance, ::selection and scrollbars themed from the palette, color-scheme dark declared for the dark scheme. web-design-guidelines review on the changed files produced the color-scheme, balance and hover-underline fixes; lint:design and eslint clean.

## Chat shell restructure (user-driven UX pass)

- The Ask screen was rebuilt into the chat-shell pattern the user asked for (Claude, ChatGPT, Gemini): a top bar with a hamburger and the wordmark on the left and the account email plus Sign out on the right, a sliding conversations drawer on the left, a sliding citation-source dock on the right, a Library popup, and a thread with a sticky composer at the bottom.
- Route groups made the header split clean: the wordmark header moved from the root layout into a new (site) group (home, library, and auth pages), while /ask lives outside the group with a visually hidden h1 and a fixed-height h-dvh layout. All URLs are unchanged; the route table still lists /, /ask, /library, and every auth route.
- All three panels are always-mounted slides closed with transform classes and the inert attribute, so both directions animate, off-screen content cannot be focused or seen by assistive tech, and there are no mount/unmount races. One shared scrim (a flat rgb(0 0 0 / 0.4) button, no backdrop-filter) fades in over the shell; visibility transitions with a delay so its fade-out completes. Opening the dock closes the drawer and vice versa; overflow-hidden on main keeps the off-screen slides from creating page scroll (verified scrollWidth equals clientWidth at 1280 and 375).
- Focus is managed per layer: Escape closes the Library popup, then the drawer, then the dock (a single window keydown effect); opening a layer focuses its close button; closing restores focus to the exact trigger element stored when the layer opened, and focus return is verified (citation button, hamburger, Open library button).
- The Library popup embeds UploadPanel and DocumentsList from server-fetched full summaries (the ask page now selects all documents for the popup, ready ones for the thread) and reads the Supabase env for the upload panel. UploadPanel gained an optional onNavigate callback so its done-link closes the popup while /ask?document=<id> remounts the panel with that document selected (the remount key now covers initialDocumentId and a freshnonce so explicit resets really reset).
- AskPanel renders a scrollable thread whose user questions are right-aligned surface bubbles with plain full-width assistant answers, and a bottom composer: error line, a document chip (aria-expanded picker that opens upward with checkboxes and Select all/Clear all, closes on Escape or an outside pointerdown), the sr-only-labelled textarea, and the Ask/Stop button. Enter submits, Shift+Enter adds a line; the Enter hint is desktop only.
- The thread auto-scrolls to follow streamed tokens only while the reader is already at the bottom (near-bottom check on scroll), so scrolling up to inspect earlier turns is never yanked back down.
- Verified end to end on the production build: fresh shell render, drawer list and Open/restore with the Continuing header and closest passages, question streamed with a verified citation, citation click opened the right dock with the highlighted page and Cited passage box, Library popup showed upload and index lists, every layer dismissed by Escape with correct focus return, documents chip popover, no horizontal overflow at 1280 and 375, empty console. impeccable detect returned no findings; lint:design and eslint clean. Drawer conversation rows were re-stacked after live review: title with Open/Delete on the first line, metadata on its own line, so the date never wraps mid-token. Overlay close buttons were raised to a 44 px touch target from the web interface guidelines review.

## Library search and table (F8)

- The document index became a real table (name, pages, status, date added, delete action) with a labeled type="search" filter that matches file names case-insensitively; a count in the section heading shows how many of the visible rows match the query. The filter is client state, not a query parameter, because the same component is embedded in the Ask screen's Library popup where a URL change would fight the chat shell's own state.
- Documents without real pagination (docx, txt, md) are ingested as one logical page, so the Pages column shows 1 rather than a dash; the previous list copy and the Ask document chip already described these files as one page, so the table matches the rest of the interface.
- Empty states are distinct: no documents at all keeps the upload guidance, a query with no matches shows the query itself with plain instructions, and the transitional status polling and inline delete confirm are unchanged. Verified in the browser on the production build: filter narrows the table and the count, no-match message renders, all rows return when cleared, the delete confirm appears in the action cell and cancels without deleting, popup embed carries the same search and table, no console errors, no horizontal overflow.
- Guidelines review fixes applied to the new markup: file sizes use non-breaking spaces, search input carries a name, spellcheck off, autocomplete off, and an ellipsis-ending placeholder, page and date cells are tabular-num, and a stray em dash placeholder for missing page counts was replaced (banned by the design gate).

## Plans, quotas, and usage meter (F9 and F10)

- Plan budgets live in one place (src/lib/usage.ts PLANS): free 3 documents and 30 questions per day, Pro 50 documents and 500 questions per day. The document limit changed from a monthly count to what the library holds right now, so deleting a document frees the slot immediately; requestUpload counts owed documents server-side every time, with the same method the meter reads, and the ask route already enforced the daily question limit with key ask:user id, so quota numbers seen in the UI and the enforcement cannot disagree.
- The daily question window in the database rate limiter is anchored to first use, not midnight UTC; the meter copies that behavior when reading the row (active window shows the stored count, an expired row counts as zero), and its exhausted copy only promises a reset when the window elapses. A failed quota read shows a full budget rather than an error, matching the fail-open stance of check_rate_limit.
- F10 hasn't a separate model, only the reading of enforcement state: the ask screen's top bar shows a questions-left line next to the account email (hidden below 1024 px where the email already sits), and the library page now has a grouped card with the thin bar pattern the upload panel already used. The bars are aria-hidden decoration; the numbers are the accessible content.
- Verified in the browser on the production build: the meter renders 3 of 3 documents (error color bar) with the expired window counting as 0 of 30 questions used, a fourth upload is rejected server-side before any row is written with the plan message in the upload panel, the ask top bar line is present in the DOM and hidden below the breakpoint, one real ask decremented the meter to 1 of 30 on reload, no console errors, lint:design and build clean, impeccable detect without change.
