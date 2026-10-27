import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeCode,
  fetchGoogleProfile,
  googleConfig,
  GOOGLE_STATE_COOKIE,
  signInWithGoogle,
  statesMatch,
} from "@/lib/google";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, startSession } from "@/lib/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * PRD F17. Google sends the browser here with the code from the consent
 * screen. Every exit clears the state cookie. The state must match the one
 * this browser was issued, the profile must carry a Google-verified address,
 * and only then does the account row exist or get found and a normal session
 * start. Anything unexpected lands on /signin with the reason in plain
 * language instead of a stack trace.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const toSignin = (reason: string) => {
    const response = NextResponse.redirect(new URL(`/signin?google=${reason}`, request.url));
    response.cookies.set(GOOGLE_STATE_COOKIE, "", {
      httpOnly: true,
      secure: url.origin.startsWith("https"),
      sameSite: "lax",
      path: "/api/auth/google",
      maxAge: 0,
    });
    return response;
  };

  if (!googleConfig()) return toSignin("not-configured");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = request.cookies.get(GOOGLE_STATE_COOKIE)?.value;
  if (!code || !statesMatch(expected, state)) return toSignin("state");

  const ip = await clientIp();
  if (!(await rateLimit(`google-callback:${ip}`, 10, 600))) return toSignin("busy");

  let user: { id: string };
  try {
    const accessToken = await exchangeCode(code);
    const profile = await fetchGoogleProfile(accessToken);
    if (!profile.emailVerified) return toSignin("unverified");
    user = await signInWithGoogle(profile);
  } catch (error) {
    console.error(
      "[google] sign-in failed:",
      error instanceof Error ? error.message : error,
    );
    return toSignin("failed");
  }

  let session: Awaited<ReturnType<typeof startSession>>;
  try {
    session = await startSession(user.id);
  } catch (error) {
    console.error(
      "[google] could not start the session:",
      error instanceof Error ? error.message : error,
    );
    return toSignin("failed");
  }

  const response = NextResponse.redirect(new URL("/library", request.url));
  response.cookies.set(SESSION_COOKIE, session.token, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: session.maxAge,
  });
  response.cookies.set(GOOGLE_STATE_COOKIE, "", {
    httpOnly: true,
    secure: url.origin.startsWith("https"),
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 0,
  });
  return response;
}
