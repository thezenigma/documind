import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { logout } from "@/lib/auth-actions";
import { AskPanel, type AskDocument } from "@/components/ask/ask-panel";

export const metadata = { title: "Ask" };

// Session-gated page: render per request (see docs/decisions.md).
export const instant = false;

export default async function AskPage() {
  const user = await requireUser();

  const { data } = await db()
    .from("documents")
    .select("id, file_name, pages")
    .eq("user_id", user.id)
    .eq("status", "ready")
    .order("created_at", { ascending: true });
  const documents = (data ?? []) as AskDocument[];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Ask your documents</h1>
          <p className="mt-1 text-base text-muted">
            Choose documents, ask a question, and check every answer against the
            page it came from.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/library" className="link text-sm">
            Library
          </Link>
          <form action={logout}>
            <button type="submit" className="btn btn-secondary">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {documents.length === 0 ? (
        <section className="mt-8 rounded-[6px] border border-border bg-surface p-8">
          <h2 className="text-xl">Nothing indexed yet</h2>
          <p className="mt-2 text-base text-muted">
            Upload a document in your library and wait for it to finish
            indexing. Once it is ready, come back here to ask a question
            about it.
          </p>
          <p className="mt-4">
            <Link href="/library" className="link">
              Go to your library
            </Link>
          </p>
        </section>
      ) : (
        <div className="mt-8">
          <AskPanel documents={documents} />
        </div>
      )}
    </main>
  );
}
