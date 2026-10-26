import { redirect } from "next/navigation";
import { getCurrentUser, requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import {
  DEMO_QUESTION_LIMIT,
  demoDocuments,
  demoOwnerId,
  demoRemaining,
  readDemoVisitorId,
} from "@/lib/demo";
import { clientIp } from "@/lib/rate-limit";
import { getUsage } from "@/lib/usage";
import { AskShell } from "@/components/ask/ask-shell";
import type { AskDocument } from "@/components/ask/ask-panel";
import type { DocumentSummary } from "@/components/library/documents-list";

export const metadata = { title: "Ask" };

// Session-gated page: render per request (see docs/decisions.md).
export const instant = false;

/** The signed in ask page, with the library popup alongside the ready list. */
async function AuthedAsk({
  user,
  initialDocumentId,
}: {
  user: NonNullable<Awaited<ReturnType<typeof requireUser>>>;
  initialDocumentId: string | null;
}) {
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
  const usage = await getUsage(user.plan, user.id);

  return (
    <AskShell
      documents={documents}
      libraryDocuments={libraryDocuments}
      supabaseUrl={supabaseUrl}
      anonKey={anonKey}
      email={user.email}
      usageLine={`${usage.questionsLeft} of ${usage.dailyQuestionLimit} questions left today`}
      initialDocumentId={initialDocumentId}
    />
  );
}

/**
 * The anonymous demo page (PRD F12). It shows the fixed demo documents and the
 * visitor's remaining questions, and nothing from any account: no library, no
 * saved threads, no plan details.
 */
async function DemoAsk({ initialDocumentId }: { initialDocumentId: string | null }) {
  const ownerId = demoOwnerId();
  if (!ownerId) redirect("/");

  const documents = await demoDocuments(ownerId);
  const remaining = await demoRemaining(await clientIp(), await readDemoVisitorId());
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";

  return (
    <AskShell
      demo
      documents={documents}
      libraryDocuments={[]}
      supabaseUrl={supabaseUrl}
      anonKey={anonKey}
      demoRemaining={remaining}
      demoLimit={DEMO_QUESTION_LIMIT}
      usageLine={`${remaining} of ${DEMO_QUESTION_LIMIT} demo questions left today`}
      initialDocumentId={initialDocumentId}
    />
  );
}

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { document: documentParam } = await searchParams;
  const initialDocumentId = typeof documentParam === "string" ? documentParam : null;

  const user = await getCurrentUser();
  const body =
    user && user.emailVerified ? (
      <AuthedAsk user={user} initialDocumentId={initialDocumentId} />
    ) : (
      <DemoAsk initialDocumentId={initialDocumentId} />
    );

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
        {body}
      </main>
    </>
  );
}
