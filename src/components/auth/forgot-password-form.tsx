"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/lib/auth-actions";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.message && (
        <p className={state.ok ? "form-message form-message-ok" : "form-message form-message-error"} role="alert">
          {state.message}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="forgot-email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="forgot-email"
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
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Sending..." : "Send reset link"}
      </button>
    </form>
  );
}
