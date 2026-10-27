import "server-only";
import { timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { normalizeEmail } from "./validation";

/** PRD F17: Google sign-in works alongside email login and is gated entirely
    by GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Unset means the feature does
    not exist: the button says so honestly and both routes refuse to pretend.
    The three endpoint URLs are overridable so the whole flow can be proven
    against a local stub before real credentials exist; the defaults are
    Google's own. */

const appUrl = process.env.AUTH_URL || "http://localhost:3000";

const AUTHORIZE_URL =
  process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
const USERINFO_URL =
  process.env.GOOGLE_USERINFO_URL || "https://openidconnect.googleapis.com/v1/userinfo";

export const GOOGLE_STATE_COOKIE = "documind_google_state";
export const GOOGLE_STATE_SECONDS = 600;

export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: `${appUrl}/api/auth/google/callback` };
}

/** Where the browser is sent to choose a Google account. prompt=select_account
    is what makes a second account possible without signing out of Google first. */
export function googleAuthUrl(state: string): string {
  const cfg = googleConfig();
  if (!cfg) throw new Error("Google sign-in is not configured.");
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("state", state);
  return url.toString();
}

/** Compares two strings without leaking where they differ through timing. */
export function statesMatch(expected: string | undefined, given: string | null): boolean {
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function exchangeCode(code: string): Promise<string> {
  const cfg = googleConfig();
  if (!cfg) throw new Error("Google sign-in is not configured.");
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`token exchange failed with ${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("token exchange returned no access token");
  return json.access_token;
}

export type GoogleProfile = { email: string; emailVerified: boolean };

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`userinfo failed with ${res.status}`);
  const json = (await res.json()) as { email?: string; email_verified?: boolean };
  if (!json.email) throw new Error("Google returned no email address");
  return { email: normalizeEmail(json.email), emailVerified: json.email_verified === true };
}

export type GoogleUser = { id: string; email: string; created: boolean };

/**
 * Finds the account behind a Google email, creating it on first sign-in. A
 * Google-only account has no password_hash, which is what the password form
 * and the deletion flow key off to explain themselves. Google already proved
 * the mailbox, so an existing unverified account is verified by this sign in.
 * The read-then-write race resolves by catching the unique violation rather
 * than by trusting the first read.
 */
export async function signInWithGoogle(profile: GoogleProfile): Promise<GoogleUser> {
  const email = normalizeEmail(profile.email);
  const { data: existing } = await db()
    .from("users")
    .select("id, email, email_verified_at")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    if (!existing.email_verified_at && profile.emailVerified) {
      const { error } = await db()
        .from("users")
        .update({ email_verified_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) console.error("[google] could not mark the address verified:", error.message);
    }
    return { id: existing.id, email: existing.email, created: false };
  }

  const { data: created, error } = await db()
    .from("users")
    .insert({
      email,
      password_hash: null,
      email_verified_at: profile.emailVerified ? new Date().toISOString() : null,
    })
    .select("id, email")
    .single();

  if (error || !created) {
    if (error?.code === "23505") {
      const { data: raced } = await db()
        .from("users")
        .select("id, email")
        .eq("email", email)
        .single();
      if (raced) return { id: raced.id, email: raced.email, created: false };
    }
    console.error("[google] could not create the account:", error?.message);
    throw new Error("Could not create the account from Google. Try again.");
  }

  return { id: created.id, email: created.email, created: true };
}
