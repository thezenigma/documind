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
