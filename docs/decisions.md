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
