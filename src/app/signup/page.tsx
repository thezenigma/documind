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
        <div className="mt-8">
          <SignupForm />
        </div>
      </div>
    </main>
  );
}
