import Link from "next/link";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = { title: "Choose a new password" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function ResetPasswordPage(props: PageProps<"/reset-password">) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Suspense
          fallback={<p className="text-base text-muted">Loading the reset form…</p>}
        >
          <ResetPasswordContent searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function ResetPasswordContent({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";

  if (!token) {
    return (
      <>
        <h1 className="text-2xl">Choose a new password</h1>
        <p className="mt-2 text-base text-error" role="alert">
          This reset link is invalid or has expired.{" "}
          <Link href="/forgot-password" className="link">
            Request a new one
          </Link>
          .
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl">Choose a new password</h1>
      <p className="mt-2 text-base text-muted">
        Pick a password you have not used on DocuMind before.
      </p>
      <div className="mt-8">
        <ResetPasswordForm token={token} />
      </div>
    </>
  );
}
