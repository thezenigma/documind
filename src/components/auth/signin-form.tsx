"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "@/lib/auth-actions";

export function SigninForm() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.message && (
        <p className="form-message form-message-error" role="alert">
          {state.message}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signin-email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="signin-email"
          name="email"
          type="email"
          autoComplete="email"
          required
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
        <label htmlFor="signin-password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="signin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
          aria-invalid={state?.fieldErrors?.password ? true : undefined}
        />
        {state?.fieldErrors?.password && (
          <p className="field-error" role="alert">
            {state.fieldErrors.password}
          </p>
        )}
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-sm text-muted">
        <Link href="/forgot-password" className="link">
          Forgot your password?
        </Link>
      </p>
      <p className="text-sm text-muted">
        New to DocuMind?{" "}
        <Link href="/signup" className="link">
          Create an account
        </Link>
      </p>
    </form>
  );
}
