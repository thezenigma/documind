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
