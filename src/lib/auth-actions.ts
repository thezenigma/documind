"use server";

import { hash, compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "./db";
import { type FormState } from "./forms";
import { sendMail } from "./mailer";
import { clientIp, rateLimit } from "./rate-limit";
import { createSession, deleteSession, deleteSessionsForUser } from "./session";
import { hashToken, newToken } from "./tokens";
import { emailError, normalizeEmail, passwordError } from "./validation";

const appUrl = process.env.AUTH_URL || "http://localhost:3000";

/** Replaces any outstanding verification token and emails a fresh link. */
async function issueVerification(userId: string, email: string): Promise<void> {
  const { token, hash: tokenHash } = newToken();
  await db()
    .from("auth_tokens")
    .delete()
    .eq("user_id", userId)
    .eq("kind", "verify_email")
    .is("used_at", null);
  const { error } = await db().from("auth_tokens").insert({
    user_id: userId,
    token_hash: tokenHash,
    kind: "verify_email",
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) {
    console.error("[auth] could not store verification token:", error.message);
    throw new Error("Could not prepare the verification email. Try again.");
  }
  await sendMail({
    to: email,
    subject: "Confirm your DocuMind email",
    text:
      `Open this link to verify your email and start using DocuMind:\n\n` +
      `${appUrl}/api/auth/verify-email?token=${token}\n\n` +
      `The link expires in 24 hours. If you did not sign up, ignore this message.`,
  });
}

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const ip = await clientIp();
  if (!(await rateLimit(`signup:${ip}`, 5, 3600))) {
    return { message: "Too many signups from this connection. Try again in an hour." };
  }

  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const fieldErrors = {
    email: emailError(email) ?? undefined,
    password: passwordError(password) ?? undefined,
  };
  if (fieldErrors.email || fieldErrors.password) return { fieldErrors };

  const passwordHash = await hash(password, 10);
  const { data: user, error } = await db()
    .from("users")
    .insert({ email, password_hash: passwordHash })
    .select("id, email")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { message: "An account with that email already exists. Sign in instead." };
    }
    console.error("[signup] insert failed:", error.message);
    return { message: "Something went wrong while creating the account. Try again." };
  }

  await issueVerification(user.id, user.email);
  redirect("/check-email");
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const ip = await clientIp();
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const fieldErrors = {
    email: emailError(email) ?? undefined,
    password: password ? undefined : "Enter your password.",
  };
  if (fieldErrors.email || fieldErrors.password) return { fieldErrors };

  if (!(await rateLimit(`login:${ip}`, 15, 900))) {
    return { message: "Too many sign-in attempts from this connection. Wait 15 minutes and try again." };
  }
  if (!(await rateLimit(`login:${email}`, 15, 900))) {
    return { message: "Too many sign-in attempts for this account. Wait 15 minutes and try again." };
  }

  const { data: user } = await db()
    .from("users")
    .select("id, password_hash, email_verified_at")
    .eq("email", email)
    .maybeSingle();

  const valid = user ? await compare(password, user.password_hash) : false;
  if (!user || !valid) return { message: "Email or password is incorrect." };
  if (!user.email_verified_at) {
    return {
      message:
        "Your email is not verified yet. Open the link we sent when you signed up, or request a new one.",
    };
  }

  await createSession(user.id);
  redirect("/library");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/");
}

export async function resendVerification(_prev: FormState, formData: FormData): Promise<FormState> {
  const ip = await clientIp();
  if (!(await rateLimit(`verify:${ip}`, 5, 3600))) {
    return { message: "Too many requests from this connection. Try again in an hour." };
  }

  const email = normalizeEmail(formData.get("email"));
  const emailFail = emailError(email);
  if (emailFail) return { fieldErrors: { email: emailFail } };

  const { data: user } = await db()
    .from("users")
    .select("id, email_verified_at")
    .eq("email", email)
    .maybeSingle();
  if (user && !user.email_verified_at) await issueVerification(user.id, email);

  return {
    ok: true,
    message: "If that address has an unverified account, a new verification link is on its way.",
  };
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const ip = await clientIp();
  if (!(await rateLimit(`reset:${ip}`, 5, 3600))) {
    return { message: "Too many reset requests from this connection. Try again in an hour." };
  }

  const email = normalizeEmail(formData.get("email"));
  const emailFail = emailError(email);
  if (emailFail) return { fieldErrors: { email: emailFail } };

  const { data: user } = await db()
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (user) {
    const { token, hash: tokenHash } = newToken();
    await db()
      .from("auth_tokens")
      .delete()
      .eq("user_id", user.id)
      .eq("kind", "reset_password")
      .is("used_at", null);
    const { error } = await db().from("auth_tokens").insert({
      user_id: user.id,
      token_hash: tokenHash,
      kind: "reset_password",
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    if (error) {
      console.error("[reset] could not store token:", error.message);
      throw new Error("Could not prepare the reset email. Try again.");
    }
    await sendMail({
      to: email,
      subject: "Reset your DocuMind password",
      text:
        `Choose a new password with this link:\n\n` +
        `${appUrl}/reset-password?token=${token}\n\n` +
        `The link expires in 1 hour. Changing your password signs out every device. ` +
        `If you did not request this, ignore this message.`,
    });
  }

  return {
    ok: true,
    message: "If that address has an account, a password reset link is on its way. It expires in 1 hour.",
  };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const passwordFail = passwordError(password);
  if (passwordFail) return { fieldErrors: { password: passwordFail } };
  if (!token) {
    return { message: "This reset link is invalid or has expired. Request a new one." };
  }

  const { data: claimed } = await db()
    .from("auth_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", hashToken(token))
    .eq("kind", "reset_password")
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id");
  if (!claimed || claimed.length === 0) {
    return { message: "This reset link is invalid or has expired. Request a new one." };
  }

  const passwordHash = await hash(password, 10);
  const { error } = await db()
    .from("users")
    .update({ password_hash: passwordHash })
    .eq("id", claimed[0].user_id);
  if (error) {
    console.error("[reset] password update failed:", error.message);
    throw new Error("Could not update the password. Try again.");
  }

  await deleteSessionsForUser(claimed[0].user_id);
  redirect("/signin?reset=1");
}
