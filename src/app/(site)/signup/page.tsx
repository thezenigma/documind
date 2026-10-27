import { GoogleButton } from "@/components/auth/google-button";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl">Create your account</h1>
        <p className="mt-2 text-base text-muted">
          Upload documents, ask a question in plain language, and check every
          answer against the page it came from.
        </p>
        <div className="mt-6">
          <GoogleButton />
        </div>
        <p className="my-4 flex items-center gap-3 text-sm text-muted">
          <span className="h-px flex-1 bg-border" aria-hidden="true" />
          or use email
          <span className="h-px flex-1 bg-border" aria-hidden="true" />
        </p>
        <SignupForm />
      </div>
    </main>
  );
}
