import Link from "next/link";
import { Suspense } from "react";
import { GoogleButton } from "@/components/auth/google-button";
import { SigninForm } from "@/components/auth/signin-form";

export const metadata = { title: "Sign in" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SigninPage(props: PageProps<"/signin">) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="margin-rule w-full max-w-sm [--margin-left:-14px]">
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
          <GoogleButton />
        </div>
        <p className="my-4 flex items-center gap-3 text-sm text-muted">
          <span className="h-px flex-1 bg-border" aria-hidden="true" />
          or sign in with email
          <span className="h-px flex-1 bg-border" aria-hidden="true" />
        </p>
        <SigninForm />
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
  const google = typeof sp.google === "string" ? sp.google : null;

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
  if (google === "not-configured") {
    return (
      <p className="form-message form-message-error">
        Google sign-in is not configured on this deployment. Sign in with your
        email and password instead.
      </p>
    );
  }
  if (google === "state") {
    return (
      <p className="form-message form-message-error">
        That Google sign-in could not be checked. Start again from the Google
        button.
      </p>
    );
  }
  if (google === "unverified") {
    return (
      <p className="form-message form-message-error">
        Google reports this address as unverified. Verify it with Google, then
        sign in again.
      </p>
    );
  }
  if (google === "busy") {
    return (
      <p className="form-message form-message-error">
        Too many Google sign-in attempts from this connection. Wait a few
        minutes and try again.
      </p>
    );
  }
  if (google === "failed") {
    return (
      <p className="form-message form-message-error">
        Google sign-in did not complete. Try again, or sign in with your email
        and password.
      </p>
    );
  }
  return null;
}
