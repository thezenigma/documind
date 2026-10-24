import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl">Reset your password</h1>
        <p className="mt-2 text-base text-muted">
          Enter your account email and we will send a link to choose a new
          password. The link expires in 1 hour.
        </p>
        <div className="mt-8">
          <ForgotPasswordForm />
        </div>
        <p className="mt-6 text-sm text-muted">
          Remembered it?{" "}
          <Link href="/signin" className="link">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
