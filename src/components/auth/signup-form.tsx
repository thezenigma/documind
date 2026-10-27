"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup } from "@/lib/auth-actions";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.message && (
        <p className="form-message form-message-error" role="alert">
          {state.message}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          className="input"
          aria-invalid={state?.fieldErrors?.email ? true : undefined}
        />
        {state?.fieldErrors?.email && (
          <p className="field-error" role="alert">
            {state.fieldErrors.email}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={200}
          className="input"
          aria-invalid={state?.fieldErrors?.password ? true : undefined}
        />
        <p className="text-sm text-muted">At least 8 characters with a letter and a number, up to 200.</p>
        {state?.fieldErrors?.password && (
          <p className="field-error" role="alert">
            {state.fieldErrors.password}
          </p>
        )}
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Creating account…" : "Sign up"}
      </button>
      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link href="/signin" className="link">
          Sign in
        </Link>
      </p>
    </form>
  );
}
