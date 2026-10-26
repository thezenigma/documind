# Remaining PRD features: F12 to F18

Order is decided by what can be built and proven without a schema change, so nothing
sits half-finished waiting on a migration. Every feature lands as its own commit only
after it passes a live browser test against the running server.

## Ground rules for this pass

- No secrets in commits. `.env.local` is gitignored and is checked before every commit.
- `npm run lint` and `npm run build` (which runs `lint:design`) must be clean before a commit.
- Every UI change gets the impeccable detector and the web-design-guidelines pass.
- Inline confirms only. No `window.confirm` anywhere.
- Plain language in every state a user can read. No em dashes, no emojis.

## Current schema (verified against the live database)

| Table | Columns |
| --- | --- |
| users | id, email, password_hash, plan, email_verified_at, is_admin, created_at |
| documents | id, user_id, file_name, mime_type, size_bytes, pages, status, error, storage_key, created_at |
| chunks | id, document_id, text, token_count, page_start, page_end, section_title, embedding, search_tsv |
| conversations | id, user_id, title, document_ids, created_at |
| messages | id, conversation_id, role, content, created_at |
| usage_events | id, user_id, kind, tokens_in, tokens_out, cost_estimate, created_at |
| rate_limits | key, window_start, count |
| sessions | id, user_id, created_at, expires_at |
| auth_tokens | id, user_id, kind, token_hash, used_at, created_at, expires_at |

Two features need columns that do not exist yet (F14 errors, F15 feedback). There is no
`psql`, no Supabase CLI, and PostgREST cannot run DDL, so the migration is written into
the repo and run once by hand in the Supabase SQL editor. Everything else ships first.

---

## F12 Anonymous demo mode (no schema change)

Spec: 5 questions per visitor per day, pre-loaded documents only, rate limited by IP
and a cookie.

**New `src/lib/demo.ts`**
- `demoOwnerId()` reads `DEMO_USER_ID`. Unset means the demo does not exist and the
  ask route keeps returning the normal sign-in answer. Nothing is half-enabled.
- `DEMO_QUESTION_LIMIT = 5`, `DEMO_WINDOW_SECONDS = 86400`.
- `visitorId()` reads the `documind_demo_visitor` cookie or mints a UUID.
- `demoRemaining(ip, visitorId)` returns the smaller of the two counters so the page
  can tell the truth before the first question is asked.

**`src/app/api/ask/route.ts`**
- The gate becomes `getSessionUser()` (nullable) instead of `requireUser()`.
- No session and no `DEMO_USER_ID`: unchanged 403 message.
- No session with a demo owner: the demo path runs the real pipeline.
  - Both rate limits are checked, `demo-ip:<ip>` and `demo-vis:<visitorId>`, limit 5.
    The stricter of the two answers. This is what makes a shared office IP fair: the
    cookie carries the visitor, the IP carries everyone else.
  - Document ids from the client are discarded. The path loads the demo owner's ready
    documents itself, so a forged id can never reach another account's chunks.
  - No conversation row, no message rows. A visitor leaves nothing behind.
  - `usage_events` is still written, attributed to the demo owner, so the admin view
    can see demo traffic and its token cost.
  - The response carries `Set-Cookie` for the visitor id, `SameSite=Lax`, no `Secure`
    flag on localhost.
- Signed-in behaviour is untouched, including conversation and message writes.

**`src/app/ask/page.tsx`**
- `requireUser()` becomes a nullable lookup. Unauthenticated renders a demo shell:
  fixed demo document list, no library, no conversations drawer, and the line
  "N of 5 demo questions left today".

**`src/components/ask/ask-shell.tsx`**
- New `demo` prop. Hides the menu button, the conversations drawer, the library link
  and sign out. Shows a single "Create an account" link so the visitor has a next step.
  Citation drawer, document picker, stop button and export all still work.

**`src/app/(site)/page.tsx`**
- "Try the demo" link next to the existing primary action.

**Tests**
1. Signed out, `/ask` renders the demo shell with the two demo documents and "5 of 5".
2. Real ask against the demo documents streams an answer with verified citations.
3. Counter drops to 4, cookie is set in the browser.
4. Forged document ids from another account are ignored, the answer still only uses
   demo documents.
5. Five questions used, the sixth returns the limit message in plain language.
6. `rate_limits` shows both the IP key and the visitor key.
7. Signed-in flow still creates conversations and messages.

---

## F13 Account and data deletion (no schema change)

Spec: deletion cascades to storage, chunks, embeddings, messages. Verified by a test.

**`src/lib/account-actions.ts`**
- `deleteAccount(prev, formData)` server action.
- Requires a signed-in user and the exact account password typed into the field.
  Wrong password answers inline and deletes nothing.
- Order matters, because a partial deletion is worse than a failed one:
  1. Read every `documents.storage_key` for the user.
  2. Delete the storage objects, per user folder, through the service client.
  3. Delete `messages` joined through the user's conversations.
  4. Delete `conversations`.
  5. Delete `chunks` for the user's documents, which takes the embeddings with them
     since the vector lives on the chunk row.
  6. Delete `documents`.
  7. Delete `sessions`, `auth_tokens`, `usage_events`, `rate_limits` rows.
  8. Delete the `users` row last, so an orphaned user row is impossible.
- Any failure stops the run and reports which stage stopped, instead of claiming the
  account is gone.

**`src/app/(site)/account/page.tsx`**
- New page: plan line, the account email, and a danger zone that asks the reader to
  type their email address to enable the delete button, then confirms inline and
  redirects to the home page on success.

**Test**
Create a throwaway account, upload a document through the real UI so storage, chunks
and a message row all exist, then delete it and assert every table is empty for that
id and the storage object returns 404.

---

## F16 Export conversation to Markdown (no schema change)

Spec: file includes questions, answers and citation references.

**`src/components/ask/ask-panel.tsx`**
- An "Export" action builds the Markdown client side from the same state the thread
  already renders, so it cannot disagree with what is on screen.
- Structure: title line, exported date, then per turn a `## Question` and `## Answer`
  pair with `[n]` markers left inline, then a numbered reference list per answer with
  file name, page range, quote and verification state.
- Downloaded as `<title>.md` through a Blob URL, which works with no server round trip
  and no extra permission.

**Tests**
Export a real conversation with citations and a refusal, open the file, and check the
questions, answers, reference list and refusal wording all survive the trip.

---

## F18 Dark theme (no schema change)

Spec: follows system setting with a manual switch.

- Tailwind moves to `class` dark mode. A small `ThemeProvider` applies `dark` on
  `<html>`: stored choice if there is one, otherwise `matchMedia`, with the listener
  kept live so a system switch at 3am is picked up.
- Palette gains a dark half that keeps the warm paper character: ink becomes warm
  off-white on near-black, the terracotta accent stays, borders lift one step so the
  grid is still readable.
- A three-position switch in the ask shell header and the site footer: System, Light,
  Dark. The current position is announced with `aria-pressed`.
- `lint:design` runs over the changed files before the commit.

**Tests**
Toggle in both directions live, reload to prove persistence, check the system
preference path by clearing the stored choice, and read the contrast on body text,
muted text and the accent against the dark surfaces.

---

## F17 Google sign-in (no schema change, env gated)

Spec: works alongside email login.

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` gate the whole feature. Missing means
  the button renders with the honest "not configured on this deployment" message,
  which is exactly how the Stripe upgrade already behaves.
- `/api/auth/google` starts the authorization code flow with `prompt=select_account`
  and a state token that is stored in a short lived cookie and checked on return.
- `/api/auth/google/callback` exchanges the code, reads the verified email, then
  upserts into the existing `users` table and creates the same session cookie the
  email path uses. Google-only accounts have no `password_hash`, so the password
  sign-in form refuses them with a clear message instead of a confusing one.
- Full flow needs real credentials, which only the account owner can create. This pass
  proves the not-configured path, the state mismatch rejection, and the upsert logic
  against a stubbed profile.

---

## F14 Admin usage view (needs one migration)

Spec: protected route listing users, token use, estimated cost, errors and flagged
answers.

- `requireAdmin()` reads `users.is_admin`, which already exists. No admin means the
  route is a 404, not a "no access" page, so the route does not advertise itself.
- `/admin` lists: users with plan, document count and question count; totals for
  `tokens_in`, `tokens_out` and `cost_estimate` per user and overall; failed asks from
  the new `usage_events.error` column; ingest failures from `documents.error`;
  flagged answers from the new `messages.feedback = 'down'` column with reasons.
- Migration `supabase/migrations/0001_feedback_and_errors.sql`:
  `messages.feedback`, `messages.feedback_reason`, `usage_events.error`.
- The ask route writes an `error` usage event when a generation fails, so the admin
  view shows failures and not only successes.

---

## F15 Answer feedback (same migration)

Spec: thumbs plus optional reason stored with the message.

- The ask route returns the assistant `message_id` in the final `done` frame, and
  restored messages already carry their ids, so every rendered answer can name the
  row it belongs to.
- `/api/feedback` accepts `up`, `down` or a clear action, verifies the message belongs
  to a conversation owned by the caller, and writes `feedback` and `feedback_reason`.
  A visitor never reaches it, because demo answers are never stored.
- UI: thumbs up and down on completed answers. Down opens a one-line optional reason
  field with an explicit Send. Chosen state is shown by `aria-pressed` and the accent,
  and the same control reads back the stored value when a conversation is restored.
- The admin view reads these as flagged answers, which is why F14 waits for it.

---

## Sequence

1. F12 demo mode, tested anonymous end to end.
2. F13 deletion, tested with a real throwaway account.
3. F16 export, tested against a real conversation file.
4. F18 dark theme, tested live.
5. F17 Google sign-in, tested to the edge of what needs real credentials.
6. Migration is written and handed over, then F15 and F14 land together.
7. Stripe hosted checkout as soon as the test key arrives.
