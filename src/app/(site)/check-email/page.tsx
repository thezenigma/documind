import Link from "next/link";
import { Suspense } from "react";
import { ResendForm } from "@/components/auth/resend-form";

export const metadata = { title: "Check your email" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function CheckEmailPage(props: PageProps<"/check-email">) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl">Check your email</h1>
        <div className="mt-4 min-h-[1.5rem]">
          <Suspense fallback={null}>
            <MailNotice searchParams={props.searchParams} />
          </Suspense>
        </div>
        <p className="mt-2 text-base text-muted">
          We sent a verification link to the address you signed up with. Open it
          to activate your account, then sign in. The link expires in 24 hours.
        </p>
        <p className="mt-4 text-sm text-muted">
          Nothing arrived? Check spam, or send the link again below.
        </p>
        <div className="mt-8 border-t border-border pt-6">
          <ResendForm />
        </div>
        <p className="mt-6 text-sm text-muted">
          <Link href="/signin" className="link">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

async function MailNotice({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  if (sp.mail === "failed") {
    return (
      <p className="form-message form-message-error" role="alert">
        Your account was created, but the verification email could not be sent.
        Send it again below.
      </p>
    );
  }
  return null;
}
