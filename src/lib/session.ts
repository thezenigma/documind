import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";

export const SESSION_COOKIE = "documind_session";
export const SESSION_DAYS = 30;

const secretKey = new TextEncoder().encode(process.env.AUTH_SECRET);

type SessionJwt = { sid: string };

/**
 * Creates a session row in the database, then stores a signed reference to it
 * in an httpOnly cookie. The cookie alone is useless without the row, so
 * deleting rows (logout, password reset, account deletion) ends sessions
 * immediately.
 */
export async function createSession(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const { data, error } = await db()
    .from("sessions")
    .insert({ user_id: userId, expires_at: expiresAt.toISOString() })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[session] create failed:", error?.message);
    throw new Error("Could not start a session. Try again.");
  }
  const token = await new SignJWT({ sid: data.id } satisfies SessionJwt)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

/** Verifies the cookie signature only. Cheap optimistic check for the proxy. */
export async function readSessionId(): Promise<string | null> {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const { payload } = await jwtVerify(cookie, secretKey, { algorithms: ["HS256"] });
    const sid = (payload as SessionJwt).sid;
    return typeof sid === "string" ? sid : null;
  } catch {
    return null;
  }
}

/** Removes the current session row and clears the cookie. */
export async function deleteSession(): Promise<void> {
  const sid = await readSessionId();
  if (sid) await db().from("sessions").delete().eq("id", sid);
  (await cookies()).delete(SESSION_COOKIE);
}

/** Ends every session for a user. Used on password reset and account deletion. */
export async function deleteSessionsForUser(userId: string): Promise<void> {
  await db().from("sessions").delete().eq("user_id", userId);
}
