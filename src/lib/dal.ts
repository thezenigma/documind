import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "./db";
import { readSessionId } from "./session";

export type CurrentUser = {
  id: string;
  email: string;
  plan: "free" | "pro";
  isAdmin: boolean;
  emailVerified: boolean;
};

/**
 * Data access layer. Every page and action resolves the current user through
 * this function, so no query can run without an owner. The cookie check is
 * optimistic; the session row lookup makes it authoritative, and expired or
 * deleted sessions return null.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const sid = await readSessionId();
  if (!sid) return null;
  const { data, error } = await db()
    .from("sessions")
    .select("expires_at, users ( id, email, plan, is_admin, email_verified_at )")
    .eq("id", sid)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) {
    console.error("[dal] session lookup failed:", error.message);
    return null;
  }
  const user = data?.users as
    | { id: string; email: string; plan: "free" | "pro"; is_admin: boolean; email_verified_at: string | null }
    | null
    | undefined;
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    plan: user.plan,
    isAdmin: user.is_admin,
    emailVerified: user.email_verified_at !== null,
  };
});

/** For pages and actions behind authentication. Redirects when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
}
