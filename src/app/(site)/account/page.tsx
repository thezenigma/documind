import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { getUsage } from "@/lib/usage";
import { DeleteAccountForm } from "@/components/account/delete-account-form";

export const metadata = { title: "Account" };

// Session-gated page: render per request (see docs/decisions.md).
export const instant = false;

export default async function AccountPage() {
  const user = await requireUser();
  const usage = await getUsage(user.plan, user.id);

  const [{ count: documentCount }, { count: conversationCount }] = await Promise.all([
    db().from("documents").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    db()
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-6 py-12">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-[6px] focus:border focus:border-border focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Account</h1>
          <p className="mt-1 text-base text-muted">{user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/library" className="link text-sm">
            Library
          </Link>
          <Link href="/ask" className="link text-sm">
            Ask
          </Link>
        </div>
      </div>

      <section aria-labelledby="plan-heading" className="mt-10">
        <h2 id="plan-heading" className="text-xl">
          Plan
        </h2>
        <p className="mt-2 text-base text-muted">
          You are on the {usage.plan === "pro" ? "Pro" : "free"} plan.
        </p>
        <dl className="mt-4 grid max-w-[38rem] grid-cols-2 gap-x-6 gap-y-2 text-base">
          <dt className="text-muted">Documents stored</dt>
          <dd className="font-mono tabular-nums">{documentCount ?? 0}</dd>
          <dt className="text-muted">Saved conversations</dt>
          <dd className="font-mono tabular-nums">{conversationCount ?? 0}</dd>
          <dt className="text-muted">Questions left today</dt>
          <dd className="font-mono tabular-nums">
            {usage.questionsLeft} of {usage.dailyQuestionLimit}
          </dd>
        </dl>
      </section>

      <section aria-labelledby="delete-heading" className="mt-12 border-t border-border pt-8">
        <h2 id="delete-heading" className="text-xl text-error">
          Delete this account
        </h2>
        <p className="mt-2 max-w-[62ch] text-base text-muted">
          This removes your account and everything stored with it. There is no
          undo, and nothing is kept for you.
        </p>
        <ul className="mt-4 flex max-w-[62ch] list-disc flex-col gap-1 pl-5 text-base text-muted">
          <li>The files you uploaded and every page indexed from them</li>
          <li>Your saved conversations and every message in them</li>
          <li>Your sessions, so you are signed out on every device</li>
          <li>Your usage history for this account</li>
        </ul>
        <DeleteAccountForm email={user.email} />
      </section>
    </main>
  );
}
