import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Stripe wiring for the test-mode checkout (F11). Two jobs: build a Checkout
 * Session against the REST API with a plain request, so no SDK sits between
 * this code and the one contract it uses, and verify webhook signatures the
 * way Stripe signs them (HMAC-SHA256 over "<timestamp>.<payload>", compared
 * per listed v1 signature, inside a tolerance window).
 */

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

export type CheckoutUrls = { successUrl: string; cancelUrl: string };

export async function createCheckoutSession(opts: {
  userId: string;
  email: string;
  urls: CheckoutUrls;
}): Promise<string> {
  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!secret || !priceId) {
    throw new Error("Checkout is not configured on this deployment.");
  }

  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("line_items[0][price]", priceId);
  body.set("line_items[0][quantity]", "1");
  body.set("client_reference_id", opts.userId);
  body.set("metadata[userId]", opts.userId);
  body.set("customer_email", opts.email);
  body.set("success_url", opts.urls.successUrl);
  body.set("cancel_url", opts.urls.cancelUrl);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    console.error("[billing] checkout session rejected:", res.status, detail);
    throw new Error("Stripe could not start the checkout. Try again in a moment.");
  }
  const json = (await res.json()) as { url?: string };
  if (!json.url) throw new Error("Stripe did not return a checkout page.");
  return json.url;
}

/**
 * Verifies a Stripe-Webhook-Signature header. Rejects unsigned headers, old
 * timestamps, and any payload whose recomputation does not match one of the
 * listed v1 signatures. The plan is never changed by an unverified body.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  if (!header) return false;
  const pieces = new Map<string, string[]>();
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) return false;
    const [name, value] = [part.slice(0, eq).trim(), part.slice(eq + 1).trim()];
    pieces.set(name, [...(pieces.get(name) ?? []), value]);
  }
  const timestamps = pieces.get("t") ?? [];
  const signatures = pieces.get("v1") ?? [];
  if (timestamps.length !== 1 || signatures.length === 0) return false;

  const timestamp = Number(timestamps[0]);
  if (!Number.isFinite(timestamp)) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp);
  if (ageSeconds > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamps[0]}.${payload}`)
    .digest("hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return signatures.some((sig) => {
    const got = Buffer.from(sig, "hex");
    return got.length === expectedBytes.length && timingSafeEqual(got, expectedBytes);
  });
}

/** The Taxonomy event this deployment listens to: a finished test checkout. */
export function readCompletedUserId(event: {
  type?: string;
  data?: { object?: { client_reference_id?: string; metadata?: { userId?: string } } };
}): string | null {
  if (event.type !== "checkout.session.completed") return null;
  return event.data?.object?.client_reference_id ?? event.data?.object?.metadata?.userId ?? null;
}
