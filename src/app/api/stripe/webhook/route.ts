import { db } from "@/lib/db";
import { readCompletedUserId, verifyStripeSignature } from "@/lib/stripe";

/**
 * Stripe webhook. Signature is verified before anything is parsed as
 * instructions: an unverified body receives a 400 and the plan does not
 * change. Only checkout.session.completed is understood; a finished test
 * checkout sets the plan to Pro. Nothing else (renewals, failures, other
 * event types) is trusted to change the plan here.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[billing] webhook secret is not set; refusing every event.");
    return Response.json({ error: "Webhook is not configured." }, { status: 500 });
  }

  const raw = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!verifyStripeSignature(raw, signature, secret)) {
    console.error("[billing] webhook signature check failed.");
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event: {
    type?: string;
    data?: { object?: { client_reference_id?: string; metadata?: { userId?: string } } };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Body is not Stripe JSON." }, { status: 400 });
  }

  const userId = readCompletedUserId(event);
  if (!userId) {
    // Other event types are acknowledged without action: Stripe retries on
    // anything else, and a 200 stops the retries for events we ignore.
    return Response.json({ received: true });
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(userId)) {
    console.error("[billing] webhook carried a user id that is not a UUID.");
    return Response.json({ error: "Unusable user reference." }, { status: 200 });
  }

  const { error } = await db().from("users").update({ plan: "pro" }).eq("id", userId);
  if (error) {
    console.error("[billing] webhook plan update failed:", error.message);
    return Response.json({ error: "The plan could not be saved." }, { status: 500 });
  }

  console.log(`[billing] checkout completed, user=${userId} plan=pro`);
  return Response.json({ received: true });
}
