import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { AskShell } from "@/components/ask/ask-shell";
import type { AskDocument } from "@/components/ask/ask-panel";
import type { DocumentSummary } from "@/components/library/documents-list";

export const metadata = { title: "Ask" };

// Session-gated page: render per request (see docs/decisions.md).
export const instant = false;

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const { document: documentParam } = await searchParams;
  const initialDocumentId = typeof documentParam === "string" ? documentParam : null;

  const { data } = await db()
    .from("documents")
    .select("id, file_name, pages")
    .eq("user_id", user.id)
    .eq("status", "ready")
    .order("created_at", { ascending: true });
  const documents = (data ?? []) as AskDocument[];

  // Full summaries for the Library popup, including documents still indexing.
  const { data: allDocs } = await db()
    .from("documents")
    .select("id, file_name, size_bytes, pages, status, error, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const libraryDocuments = (allDocs ?? []) as DocumentSummary[];

  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";

  return (
    <>
      <a
        href="#ask-thread"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[6px] focus:border focus:border-border focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <main id="main" className="flex h-dvh flex-col overflow-hidden">
        <h1 className="sr-only">Ask your documents</h1>
        <AskShell
          documents={documents}
          libraryDocuments={libraryDocuments}
          supabaseUrl={supabaseUrl}
          anonKey={anonKey}
          email={user.email}
          initialDocumentId={initialDocumentId}
        />
      </main>
    </>
  );
}
