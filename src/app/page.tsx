import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center px-6 py-20">
      <h1 className="text-3xl">Ask your documents a question</h1>
      <p className="mt-4 max-w-[68ch] text-lg text-muted">
        Upload a report, policy, or manual. DocuMind answers in plain language
        and shows the exact page behind every claim, so you can check the
        answer instead of trusting it.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/signup" className="btn btn-primary">
          Create an account
        </Link>
        <Link href="/signin" className="btn btn-secondary">
          Sign in
        </Link>
      </div>
    </main>
  );
}
