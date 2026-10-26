import Link from "next/link";
import { Suspense } from "react";

type SearchParams = { [key: string]: string | string[] | undefined };

async function DeletedNotice({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { deleted } = await searchParams;

  if (deleted !== "1") return null;

  return (
    <p className="form-message form-message-ok mb-8 w-full" role="status">
      Your account and everything stored with it are deleted. You are signed
      out, and nothing was kept.
    </p>
  );
}

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center px-6 py-20">
      <Suspense fallback={null}>
        <DeletedNotice searchParams={searchParams} />
      </Suspense>
      <h1 className="text-3xl">Ask your documents a question</h1>
      <p className="mt-4 max-w-[68ch] text-lg text-muted">
        Upload a report, policy, or manual. DocuMind answers in plain language
        and shows the exact page behind every claim, so you can check the
        answer instead of trusting it.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href="/ask" className="btn btn-primary">
          Try the demo
        </Link>
        <Link href="/signup" className="btn btn-secondary">
          Create an account
        </Link>
        <Link href="/signin" className="text-sm font-medium text-muted hover:text-text hover:underline">
          Sign in
        </Link>
      </div>
      <p className="mt-3 text-sm text-muted">
        The demo uses sample documents and needs no account. Five questions a day.
      </p>
    </main>
  );
}
