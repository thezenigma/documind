import "server-only";
import { headers } from "next/headers";
import { db } from "./db";

/** Best client IP for rate limiting. Vercel sets x-forwarded-for. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * Counts attempts in the database (fixed window) so the limit holds across
 * server instances. Returns true when the request is allowed. Fails open if
 * the counter itself is unavailable and logs the error, so a database problem
 * never locks people out of signing in.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await db().rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("[rate-limit] check failed, allowing request:", error.message);
    return true;
  }
  return data === true;
}

/**
 * Reads the counter stored for a key while its window is still active: the
 * usage the meter shows. A missing row or an expired one counts as zero, and
 * a database problem shows a full budget rather than an error, matching the
 * fail-open stance of check_rate_limit.
 */
export async function readUsage(
  key: string,
  windowSeconds: number,
): Promise<number> {
  const { data, error } = await db()
    .from("rate_limits")
    .select("window_start, count")
    .eq("key", key)
    .maybeSingle();
  if (error) {
    console.error("[rate-limit] usage read failed:", error.message);
    return 0;
  }
  if (!data) return 0;
  const startedAt = new Date(data.window_start as string).getTime();
  if (!Number.isFinite(startedAt)) return 0;
  return Date.now() - startedAt < windowSeconds * 1000
    ? Number(data.count) || 0
    : 0;
}
