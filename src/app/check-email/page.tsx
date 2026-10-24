import Link from "next/link";
import { ResendForm } from "@/components/auth/resend-form";

export const metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl">Check your email</h1>
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
