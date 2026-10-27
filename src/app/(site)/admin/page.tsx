import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { db } from "@/lib/db";

export const metadata = { title: "Admin" };
export const instant = false;

/** PRD F14: usage, failures and flagged answers in one place. Non-admins
    never see this page: requireAdmin answers a 404, not an access denied
    screen, so the route does not advertise itself. */

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });
const numberFormat = new Intl.NumberFormat("en-GB");
const moneyFormat = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});

type Totals = { questions: number; tokensIn: number; tokensOut: number; cost: number };

const emptyTotals = (): Totals => ({ questions: 0, tokensIn: 0, tokensOut: 0, cost: 0 });

/** Supabase returns an embedded row as an array even for a to-one relation.
    This normalizes both shapes to the email, or an honest placeholder. */
function embedEmail(value: unknown): string {
  const outer = (Array.isArray(value) ? value[0] : value) as { email?: unknown; users?: unknown } | null | undefined;
  const inner = (Array.isArray(outer?.users) ? outer.users[0] : outer?.users) as { email?: unknown } | null | undefined;
  const email = typeof inner?.email === "string" ? inner.email : typeof outer?.email === "string" ? outer.email : null;
  return email ?? "Unknown account";
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[6px] border border-border bg-surface p-6">
      <h2 className="text-xl">{title}</h2>
      <div className="mt-3">{children || <p className="text-sm text-muted">{empty}</p>}</div>
    </section>
  );
}

export default async function AdminPage() {
  await requireAdmin();

  const [usersRes, docsRes, usageRes, failedRes, ingestRes, flaggedRes] = await Promise.all([
    db().from("users").select("id, email, plan, is_admin, created_at").order("created_at", { ascending: true }),
    db().from("documents").select("user_id"),
    db().from("usage_events").select("user_id, kind, tokens_in, tokens_out, cost_estimate").limit(5000),
    db()
      .from("usage_events")
      .select("kind, error, created_at, users(email)")
      .not("error", "is", null)
      .order("created_at", { ascending: false })
      .limit(50),
    db()
      .from("documents")
      .select("file_name, error, created_at, users(email)")
      .not("error", "is", null)
      .order("created_at", { ascending: false })
      .limit(50),
    db()
      .from("messages")
      .select("content, feedback_reason, created_at, conversations(users(email))")
      .eq("feedback", "down")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (usersRes.error || usageRes.error) {
    console.error(
      "[admin] load failed:",
      usersRes.error?.message ?? "",
      usageRes.error?.message ?? "",
    );
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <h1 className="text-2xl">Admin</h1>
        <p className="form-message form-message-error mt-4" role="alert">
          The usage numbers could not be loaded. Try again in a moment.
        </p>
      </main>
    );
  }

  const users = usersRes.data ?? [];
  const usage = usageRes.data ?? [];

  const docCounts = new Map<string, number>();
  for (const row of docsRes.data ?? []) {
    docCounts.set(row.user_id, (docCounts.get(row.user_id) ?? 0) + 1);
  }

  const perUser = new Map<string, Totals>();
  const overall = emptyTotals();
  let usageCapped = false;
  for (const row of usage) {
    const totals = row.user_id ? (perUser.get(row.user_id) ?? emptyTotals()) : null;
    const add = (t: Totals) => {
      if (row.kind === "ask" || row.kind === "demo_ask") t.questions += 1;
      t.tokensIn += row.tokens_in;
      t.tokensOut += row.tokens_out;
      t.cost += Number(row.cost_estimate);
    };
    add(overall);
    if (totals) {
      add(totals);
      perUser.set(row.user_id as string, totals);
    }
  }
  if (usage.length >= 5000) usageCapped = true;

  const failedAsks = failedRes.data ?? [];
  const ingestFailures = ingestRes.data ?? [];
  const flagged = flaggedRes.data ?? [];

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl">Admin</h1>
        <Link href="/account" className="link text-sm">
          Back to account
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Accounts", value: numberFormat.format(users.length) },
          { label: "Questions asked", value: numberFormat.format(overall.questions) },
          { label: "Tokens in and out", value: `${numberFormat.format(overall.tokensIn)} / ${numberFormat.format(overall.tokensOut)}` },
          { label: "Estimated cost", value: moneyFormat.format(overall.cost) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-[6px] border border-border bg-surface p-4">
            <p className="text-sm text-muted">{stat.label}</p>
            <p className="mt-1 text-xl tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>
      {usageCapped && (
        <p className="mt-2 text-sm text-muted">
          Totals cover the most recent 5,000 usage records.
        </p>
      )}

      <div className="mt-6 flex flex-col gap-6">
        <section className="rounded-[6px] border border-border bg-surface p-6">
          <h2 className="text-xl">Accounts</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th scope="col" className="py-2 pr-4 font-semibold">Account</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Plan</th>
                  <th scope="col" className="py-2 pr-4 text-right font-semibold">Documents</th>
                  <th scope="col" className="py-2 pr-4 text-right font-semibold">Questions</th>
                  <th scope="col" className="py-2 pr-4 text-right font-semibold">Tokens in</th>
                  <th scope="col" className="py-2 pr-4 text-right font-semibold">Tokens out</th>
                  <th scope="col" className="py-2 pr-4 text-right font-semibold">Estimated cost</th>
                  <th scope="col" className="py-2 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const totals = perUser.get(u.id) ?? emptyTotals();
                  return (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4">
                        {u.email}
                        {u.is_admin && (
                          <span className="ml-2 text-xs text-accent">admin</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">{u.plan === "pro" ? "Pro" : "Free"}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {numberFormat.format(docCounts.get(u.id) ?? 0)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {numberFormat.format(totals.questions)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {numberFormat.format(totals.tokensIn)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {numberFormat.format(totals.tokensOut)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {moneyFormat.format(totals.cost)}
                      </td>
                      <td className="py-2">{dateFormat.format(new Date(u.created_at))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <Section title="Failed questions" empty="No question has failed.">
          {failedAsks.length > 0 && (
            <ul className="flex flex-col gap-3">
              {failedAsks.map((row, i) => (
                <li key={i} className="border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                  <p className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-muted tabular-nums">
                      {dateFormat.format(new Date(row.created_at))}
                    </span>
                    <span>{embedEmail(row.users)}</span>
                  </p>
                  <p className="mt-1 break-words">{row.error}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Failed uploads" empty="No upload has failed.">
          {ingestFailures.length > 0 && (
            <ul className="flex flex-col gap-3">
              {ingestFailures.map((row, i) => (
                <li key={i} className="border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                  <p className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-muted tabular-nums">
                      {dateFormat.format(new Date(row.created_at))}
                    </span>
                    <span>{row.file_name}</span>
                    <span className="text-muted">{embedEmail(row.users)}</span>
                  </p>
                  <p className="mt-1 break-words">{row.error}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Flagged answers" empty="No answer has been marked not helpful.">
          {flagged.length > 0 && (
            <ul className="flex flex-col gap-3">
              {flagged.map((row, i) => {
                const email = embedEmail(row.conversations);
                return (
                  <li key={i} className="border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                    <p className="flex flex-wrap items-baseline gap-x-3">
                      <span className="text-muted tabular-nums">
                        {dateFormat.format(new Date(row.created_at))}
                      </span>
                      <span>{email}</span>
                    </p>
                    <p className="mt-1 line-clamp-2 break-words">{row.content}</p>
                    <p className="mt-1 text-muted">
                      {row.feedback_reason ? `Reason: ${row.feedback_reason}` : "No reason given."}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </main>
  );
}
