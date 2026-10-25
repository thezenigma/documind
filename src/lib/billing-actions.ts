"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "./dal";
import { createCheckoutSession, stripeConfigured } from "./stripe";

export type UpgradeState = { ok?: boolean; message?: string } | undefined;

/**
 * Starts the Pro subscription checkout in Stripe test mode. Only the
 * handshake lives here: the plan itself is never changed in this action.
 * The webhook, which alone can prove a finished payment, flips the plan.
 */
export async function startUpgrade(_prev: UpgradeState, _formData: FormData): Promise<UpgradeState> {
  // Neither the previous state nor form fields carry data for this call;
  // referencing them keeps the useActionState signature and stays explicit.
  void _prev;
  void _formData;
  const user = await requireUser();
  if (user.plan === "pro") redirect("/library");

  if (!stripeConfigured()) {
    return {
      ok: false,
      message: "Checkout is not set up on this deployment yet. Add the Stripe test keys to enable upgrades.",
    };
  }

  const h = await headers();
  const baseUrl =
    process.env.AUTH_URL ||
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;

  try {
    const url = await createCheckoutSession({
      userId: user.id,
      email: user.email,
      urls: {
        successUrl: `${baseUrl}/library?checkout=done`,
        cancelUrl: `${baseUrl}/library?checkout=cancelled`,
      },
    });
    redirect(url);
  } catch (err) {
    // redirect() itself throws to do its job; everything else is a failure.
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error("[billing] upgrade start failed:", err instanceof Error ? err.message : err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not start the checkout. Try again.",
    };
  }
}
