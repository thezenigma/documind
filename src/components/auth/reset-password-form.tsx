"use client";

import { useActionState } from "react";
import { resetPassword } from "@/lib/auth-actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {state?.message && (
        <p className="form-message form-message-error" role="alert">
          {state.message}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="reset-password" className="text-sm font-medium">
          New password
        </label>
        <input
          id="reset-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="input"
          aria-invalid={state?.fieldErrors?.password ? true : undefined}
        />
        <p className="text-sm text-muted">At least 8 characters with a letter and a number.</p>
        {state?.fieldErrors?.password && (
          <p className="field-error" role="alert">
            {state.fieldErrors.password}
          </p>
        )}
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Updating..." : "Update password"}
      </button>
      <p className="text-sm text-muted">
        Changing your password signs out every device.
      </p>
    </form>
  );
}
