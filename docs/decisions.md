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
