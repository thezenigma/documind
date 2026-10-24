import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { logout } from "@/lib/auth-actions";
import { UploadPanel } from "@/components/library/upload-panel";
import { DocumentsList, type DocumentSummary } from "@/components/library/documents-list";

export const metadata = { title: "Your library" };

// Session-gated page: render per request instead of prerendering a shell.
// Prerendering speculatively renders the route without cookies, which poisons
// the session lookup (see docs/decisions.md).
export const instant = false;

export default async function LibraryPage() {
  const user = await requireUser();

  const { data } = await db()
    .from("documents")
    .select("id, file_name, size_bytes, pages, status, error, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const documents = (data ?? []) as DocumentSummary[];

  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-6 py-12">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-[6px] focus:border focus:border-border focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Your library</h1>
          <p className="mt-1 text-base text-muted">{user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/ask" className="link text-sm">
            Ask
          </Link>
          <form action={logout}>
            <button type="submit" className="btn btn-secondary">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="mt-8">
        <UploadPanel supabaseUrl={supabaseUrl} anonKey={anonKey} />
      </div>

      <DocumentsList documents={documents} />
    </main>
  );
}
