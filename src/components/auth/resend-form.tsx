"use client";

import { useActionState } from "react";
import { resendVerification } from "@/lib/auth-actions";

export function ResendForm() {
  const [state, formAction, pending] = useActionState(resendVerification, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state?.message && (
        <p className={state.ok ? "form-message form-message-ok" : "form-message form-message-error"} role="alert">
          {state.message}
        </p>
      )}
      <label htmlFor="resend-email" className="text-sm font-medium">
        Send the link again
      </label>
      <div className="flex gap-2">
        <input
          id="resend-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="name@example.com"
          className="input"
          aria-invalid={state?.fieldErrors?.email ? true : undefined}
        />
        <button type="submit" className="btn btn-secondary" disabled={pending}>
          {pending ? "Sending…" : "Resend"}
        </button>
      </div>
      {state?.fieldErrors?.email && (
        <p className="field-error" role="alert">
          {state.fieldErrors.email}
        </p>
      )}
    </form>
  );
}
