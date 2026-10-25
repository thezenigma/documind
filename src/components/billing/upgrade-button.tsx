"use client";

import { useActionState } from "react";
import { startUpgrade } from "@/lib/billing-actions";

/**
 * The Plan upgrade entry point. The test-mode banner sits beside the button
 * so the visitor reads it before any checkout starts, exactly as the PRD
 * asks.
 */
export function UpgradeButton({ isPro }: { isPro: boolean }) {
  const [state, formAction, pending] = useActionState(startUpgrade, undefined);

  if (isPro) {
    return (
      <p className="text-sm font-medium text-accent">Pro plan is active.</p>
    );
  }

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary text-sm" disabled={pending}>
          {pending ? "Opening checkout…" : "Upgrade to Pro"}
        </button>
        <span className="rounded-[6px] border border-border bg-surface px-2 py-1 text-xs font-medium text-muted">
          Test mode, no real charges.
        </span>
      </div>
      {state?.message && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
