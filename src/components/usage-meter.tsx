import type { Usage } from "@/lib/usage";
import { UpgradeButton } from "@/components/billing/upgrade-button";

function MeterRow({
  label,
  used,
  limit,
  exhausted,
}: {
  label: string;
  used: number;
  limit: number;
  exhausted: boolean;
}) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-mono text-sm tabular-nums text-muted">
          {used} of {limit}
        </span>
      </div>
      <div aria-hidden="true" className="mt-1.5 h-1.5 rounded-full bg-border">
        <div
          className={`h-1.5 rounded-full ${exhausted ? "bg-error" : "bg-accent"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * F10 usage meter: documents used against the plan's document count and
 * questions left today against the daily limit. The numbers come from the
 * same sources the server-side enforcement reads (see lib/usage.ts), so the
 * meter never disagrees with the quotas.
 */
export function UsageMeter({ usage }: { usage: Usage }) {
  return (
    <section aria-label="Plan usage" className="rounded-[6px] border border-border bg-surface p-6">
      <h2 className="text-xl">Usage</h2>
      <p className="mt-2 text-base">
        On the {usage.plan === "pro" ? "Pro" : "free"} plan.
        {usage.questionsLeft === 0
          ? " Every daily question is used. You can ask again when the 24 hour window resets."
          : ""}
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <MeterRow
          label="Documents used"
          used={usage.documentsUsed}
          limit={usage.documentLimit}
          exhausted={usage.documentsUsed >= usage.documentLimit}
        />
        <MeterRow
          label="Questions left today"
          /* PRD F10: shows questions LEFT today, so the row carries the
             remaining count (the account page and ask header read the same
             number; see app/(site)/account and app/ask). */
          used={usage.questionsLeft}
          limit={usage.dailyQuestionLimit}
          exhausted={usage.questionsLeft === 0}
        />
      </div>
      <UpgradeButton isPro={usage.plan === "pro"} />
    </section>
  );
}
