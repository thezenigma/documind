import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/tokens";

/** Landing point for verification links emailed at sign-up. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";

  let userId: string | null = null;
  if (token) {
    const { data, error } = await db()
      .from("auth_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token_hash", hashToken(token))
      .eq("kind", "verify_email")
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("user_id");
    if (error) console.error("[verify] token claim failed:", error.message);
    userId = data?.[0]?.user_id ?? null;
  }

  if (!userId) redirect("/signin?verified=invalid");

  const { error } = await db()
    .from("users")
    .update({ email_verified_at: new Date().toISOString() })
    .eq("id", userId)
    .is("email_verified_at", null);
  if (error) console.error("[verify] could not mark user verified:", error.message);

  redirect("/signin?verified=ok");
}
