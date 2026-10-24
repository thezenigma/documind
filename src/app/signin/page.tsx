import Link from "next/link";
import { Suspense } from "react";
import { SigninForm } from "@/components/auth/signin-form";

export const metadata = { title: "Sign in" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SigninPage(props: PageProps<"/signin">) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl">Sign in</h1>
        <p className="mt-2 text-base text-muted">
          Sign in to reach your library and conversations.
        </p>
        <div className="mt-4 min-h-[1.5rem]">
          <Suspense fallback={null}>
            <SigninNotice searchParams={props.searchParams} />
          </Suspense>
        </div>
        <div className="mt-4">
          <SigninForm />
        </div>
        <p className="mt-6 text-sm text-muted">
          Wrong address?{" "}
          <Link href="/check-email" className="link">
            Resend the verification link
          </Link>
        </p>
      </div>
    </main>
  );
}

async function SigninNotice({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const verified = typeof sp.verified === "string" ? sp.verified : null;
  const reset = typeof sp.reset === "string" ? sp.reset : null;

  if (verified === "ok") {
    return <p className="form-message form-message-ok">Email verified. Sign in to continue.</p>;
  }
  if (verified === "invalid") {
    return (
      <p className="form-message form-message-error">
        That verification link is invalid or expired. Request a new one from the
        check-email page.
      </p>
    );
  }
  if (reset) {
    return (
      <p className="form-message form-message-ok">
        Password updated. Sign in with your new password.
      </p>
    );
  }
  return null;
}
