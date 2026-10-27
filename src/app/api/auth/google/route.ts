import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  googleAuthUrl,
  googleConfig,
  GOOGLE_STATE_COOKIE,
  GOOGLE_STATE_SECONDS,
} from "@/lib/google";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const appUrl = process.env.AUTH_URL || "http://localhost:3000";

/**
 * PRD F17. Puts a short lived, httpOnly state token in a cookie scoped to
 * these two routes and sends the browser to Google with the same value in
 * the state parameter. The callback refuses anything that does not match,
 * which is what stops a forged sign-in from another site.
 */
export async function GET(request: Request) {
  const toSignin = (reason: string) =>
    NextResponse.redirect(new URL(`/signin?google=${reason}`, request.url));

  if (!googleConfig()) return toSignin("not-configured");

  const ip = await clientIp();
  if (!(await rateLimit(`google:${ip}`, 10, 600))) return toSignin("busy");

  const state = randomBytes(24).toString("hex");
  const response = NextResponse.redirect(googleAuthUrl(state));
  response.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: appUrl.startsWith("https"),
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: GOOGLE_STATE_SECONDS,
  });
  return response;
}
