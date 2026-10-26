import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { db } from "./db";
import { readUsage } from "./rate-limit";

/**
 * Anonymous demo mode (PRD F12). A visitor can question a fixed set of
 * pre-loaded documents without an account, capped at five questions a day and
 * counted twice: once by IP address, which a shared office cannot dodge, and
 * once by a visitor cookie, so two people behind one address are not charged
 * against each other. The stricter of the two counters wins.
 *
 * Everything here is gated on DEMO_USER_ID. Without it the feature does not
 * exist: the ask route keeps refusing anonymous questions outright, and no
 * half-configured demo is reachable.
 */

export const DEMO_VISITOR_COOKIE = "documind_demo_visitor";
export const DEMO_QUESTION_LIMIT = 5;
export const DEMO_WINDOW_SECONDS = 86400;
/** Long enough to span the daily window, short enough to stop tracking forever. */
const DEMO_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The demo owner, or null when the deployment has no demo configured. */
export function demoOwnerId(): string | null {
  const id = process.env.DEMO_USER_ID?.trim();
  return id && UUID_RE.test(id) ? id : null;
}

/** The visitor's existing identity, or null before the first question. */
export async function readDemoVisitorId(): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(DEMO_VISITOR_COOKIE)?.value;
  return existing && UUID_RE.test(existing) ? existing : null;
}

export function demoCookieHeader(visitorId: string): string {
  return `${DEMO_VISITOR_COOKIE}=${visitorId}; Path=/; Max-Age=${DEMO_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export type DemoDocument = { id: string; file_name: string; pages: number | null };

/**
 * The only documents a visitor can ever reach. The client's own document ids
 * are ignored on the ask route, so no forged id can pull another account's
 * chunks into a demo answer.
 */
export async function demoDocuments(ownerId: string): Promise<DemoDocument[]> {
  const { data, error } = await db()
    .from("documents")
    .select("id, file_name, pages")
    .eq("user_id", ownerId)
    .eq("status", "ready")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[demo] document list failed:", error.message);
    return [];
  }
  return (data ?? []) as DemoDocument[];
}

/** Questions this visitor may still ask today. Read only, nothing is consumed. */
export async function demoRemaining(
  ip: string,
  visitorId: string | null,
): Promise<number> {
  const [byIp, byVisitor] = await Promise.all([
    readUsage(`demo-ip:${ip}`, DEMO_WINDOW_SECONDS),
    visitorId ? readUsage(`demo-vis:${visitorId}`, DEMO_WINDOW_SECONDS) : Promise.resolve(0),
  ]);
  return Math.max(0, DEMO_QUESTION_LIMIT - Math.max(byIp, byVisitor));
}

export type DemoQuotaResult = {
  ok: boolean;
  /** Always a real id, so the response can set the cookie even on a refusal. */
  visitorId: string;
};

/**
 * Decides whether a visitor may ask, and consumes one question from both
 * counters when they may. The decision reads both counters before either is
 * incremented, so an exhausted visitor never burns an IP slot on a question
 * that is refused.
 */
export async function consumeDemoQuota(
  ip: string,
  existingVisitorId: string | null,
): Promise<DemoQuotaResult> {
  const visitorId = existingVisitorId ?? randomUUID();
  if ((await demoRemaining(ip, visitorId)) <= 0) {
    return { ok: false, visitorId };
  }

  const [byIp, byVisitor] = await Promise.all([
    db().rpc("check_rate_limit", {
      p_key: `demo-ip:${ip}`,
      p_limit: DEMO_QUESTION_LIMIT,
      p_window_seconds: DEMO_WINDOW_SECONDS,
    }),
    db().rpc("check_rate_limit", {
      p_key: `demo-vis:${visitorId}`,
      p_limit: DEMO_QUESTION_LIMIT,
      p_window_seconds: DEMO_WINDOW_SECONDS,
    }),
  ]);
  if (byIp.error) console.error("[demo] ip counter failed:", byIp.error.message);
  if (byVisitor.error) console.error("[demo] visitor counter failed:", byVisitor.error.message);
  if (byIp.error || byVisitor.error) {
    // The counter itself is unavailable. Same fail-open stance as signing in:
    // a database hiccup never blocks the demo.
    return { ok: true, visitorId };
  }
  return { ok: byIp.data === true && byVisitor.data === true, visitorId };
}
