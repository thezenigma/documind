import { Suspense } from "react";
import { requireUser } from "@/lib/dal";
import { logout } from "@/lib/auth-actions";

export const metadata = { title: "Your library" };

export default function LibraryPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Suspense fallback={<p className="text-base text-muted">Loading your library...</p>}>
        <Library />
      </Suspense>
    </main>
  );
}

async function Library() {
  const user = await requireUser();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Your library</h1>
          <p className="mt-1 text-base text-muted">{user.email}</p>
        </div>
        <form action={logout}>
          <button type="submit" className="btn btn-secondary">
            Sign out
          </button>
        </form>
      </div>

      <section className="mt-10 rounded-[6px] border border-border bg-surface p-8">
        <h2 className="text-xl">No documents yet</h2>
        <p className="mt-2 text-base text-muted">
          Upload a PDF, Word document, text file, or Markdown file up to 25 MB
          and 300 pages. Once it is indexed, ask a question in plain language
          and every answer will point to the page it came from.
        </p>
      </section>
    </>
  );
}
