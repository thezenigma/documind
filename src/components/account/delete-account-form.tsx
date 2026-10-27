"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { deleteAccount, type DeleteAccountState } from "@/lib/account-actions";

/**
 * The danger zone on the account page. Two things have to be typed, the
 * account email and the password, so the button cannot be reached by an idle
 * click and no native confirmation dialog interrupts the flow. The result of
 * the attempt, including which field was wrong, appears inline.
 */
export function DeleteAccountForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<DeleteAccountState, FormData>(
    deleteAccount,
    undefined,
  );

  // A failed attempt puts the caret in the field that was wrong, so the fix
  // starts where the error is instead of at the top of the page.
  const fieldErrors = state?.fieldErrors;
  useEffect(() => {
    if (!fieldErrors) return;
    const first = fieldErrors.confirmEmail
      ? "confirm-email"
      : fieldErrors.password
        ? "delete-password"
        : null;
    if (first) document.getElementById(first)?.focus();
  }, [fieldErrors]);

  return (
    <form action={formAction} className="mt-4 flex max-w-[38rem] flex-col gap-4">
      {state?.message && (
        <p className="form-message form-message-error" role="alert">
          {state.message}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm-email" className="text-sm font-medium">
          Type your account email to confirm
        </label>
        <p className="text-sm text-muted">
          This is <span className="font-mono">{email}</span>
        </p>
        <input
          id="confirm-email"
          name="confirmEmail"
          type="email"
          autoComplete="email"
          spellCheck={false}
          required
          maxLength={254}
          aria-invalid={state?.fieldErrors?.confirmEmail ? true : undefined}
          aria-describedby={state?.fieldErrors?.confirmEmail ? "confirm-email-error" : undefined}
          className="input mt-1"
        />
        {state?.fieldErrors?.confirmEmail && (
          <p id="confirm-email-error" className="field-error">
            {state.fieldErrors.confirmEmail}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="delete-password" className="text-sm font-medium">
          Your password
        </label>
        <input
          id="delete-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
          aria-invalid={state?.fieldErrors?.password ? true : undefined}
          aria-describedby={state?.fieldErrors?.password ? "delete-password-error" : undefined}
          className="input mt-1"
        />
        {state?.fieldErrors?.password && (
          <p id="delete-password-error" className="field-error">
            {state.fieldErrors.password}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-danger" disabled={pending}>
          {pending ? "Deleting your account…" : "Delete my account and all its data"}
        </button>
        <Link href="/library" className="btn btn-secondary">
          Keep my account
        </Link>
      </div>
    </form>
  );
}
