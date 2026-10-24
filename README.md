# DocuMind

Ask your documents a question and see the page the answer came from.

DocuMind is a document question answering web app. Upload a PDF, Word document, text file or Markdown, ask a question in plain language, and read a streamed answer where every factual claim carries a numbered citation. Clicking a citation opens the document at that page and highlights the exact passage.

Built as the flagship portfolio project for Zenigma.

## Stack

- Next.js 16 with the App Router and TypeScript
- Supabase Postgres with pgvector for retrieval, Supabase Storage for files (region ap-southeast-1)
- NVIDIA NIM API with Nemotron models for chat and embeddings
- Auth.js for email and Google sign-in
- Stripe checkout in test mode
- Deployed on Vercel

## Local setup

1. Install dependencies:

   ```
   npm install
   ```

2. Copy the environment template and fill it in:

   ```
   copy .env.example .env.local
   ```

3. Start the dev server:

   ```
   npm run dev
   ```

Open http://localhost:3000.

## Environment variables

| Key | Purpose |
|---|---|
| NVIDIA_API_KEY | Chat and embedding calls through NVIDIA NIM |
| NVIDIA_CHAT_MODEL_FAST | Default answer model |
| NVIDIA_CHAT_MODEL_STRONG | Model for questions that span several passages |
| NVIDIA_EMBEDDING_MODEL | Chunk and query embeddings |
| SUPABASE_URL | Supabase project URL |
| SUPABASE_ANON_KEY | Public anon key for signed requests |
| SUPABASE_SERVICE_ROLE_KEY | Server only, used for admin and cascade operations |
| AUTH_SECRET | Auth.js session secret |
| AUTH_URL | Base URL of the app |
| STRIPE_SECRET_KEY | Stripe test mode key |
| STRIPE_WEBHOOK_SECRET | Stripe webhook signature check |

## Documentation

- [prd.md](prd.md): product requirements, scope, success measures
- [DESIGN.md](DESIGN.md): design skill routing rules
- [docs/decisions.md](docs/decisions.md): infrastructure decisions and verified model choices
