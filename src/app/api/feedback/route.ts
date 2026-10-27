import { getCurrentUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALUES = ["up", "down", "clear"] as const;
type Value = (typeof VALUES)[number];

/**
 * PRD F15: stores a thumbs value and an optional one line reason on an
 * assistant message. Ownership is checked through the conversation, so a
 * caller can only ever touch answers in their own threads. Demo answers are
 * never stored, so they never carry a message id and never reach this route.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to record feedback." }, { status: 403 });
  }

  const ip = await clientIp();
  if (!(await rateLimit(`feedback:${ip}`, 30, 300))) {
    return Response.json(
      { error: "Too many feedback saves from this connection. Try again in a few minutes." },
      { status: 429 },
    );
  }

  let body: { messageId?: unknown; value?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request could not be read. Try again." }, { status: 400 });
  }

  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const value = VALUES.find((v) => v === body.value);
  if (!UUID_RE.test(messageId) || !value) {
    return Response.json({ error: "That feedback could not be saved. Try again." }, { status: 400 });
  }

  const reason =
    value === "down" && typeof body.reason === "string"
      ? body.reason.trim().slice(0, 500)
      : null;

  const { data: message, error: msgError } = await db()
    .from("messages")
    .select("id, role, conversation_id")
    .eq("id", messageId)
    .maybeSingle();
  if (msgError) {
    console.error("[feedback] message lookup failed:", msgError.message);
    return Response.json({ error: "Could not save your feedback. Try again." }, { status: 500 });
  }
  if (!message || message.role !== "assistant") {
    return Response.json({ error: "Feedback can only be recorded on an answer." }, { status: 404 });
  }

  const { data: conversation, error: convError } = await db()
    .from("conversations")
    .select("id, user_id")
    .eq("id", message.conversation_id)
    .maybeSingle();
  if (convError) {
    console.error("[feedback] conversation lookup failed:", convError.message);
    return Response.json({ error: "Could not save your feedback. Try again." }, { status: 500 });
  }
  if (!conversation || conversation.user_id !== user.id) {
    return Response.json({ error: "That answer is not in one of your conversations." }, { status: 404 });
  }

  const storedValue: Value | null = value === "clear" ? null : value;
  const { error: updateError } = await db()
    .from("messages")
    .update({ feedback: storedValue, feedback_reason: storedValue === "down" ? reason : null })
    .eq("id", message.id);
  if (updateError) {
    console.error("[feedback] update failed:", updateError.message);
    return Response.json({ error: "Could not save your feedback. Try again." }, { status: 500 });
  }

  return Response.json({
    ok: true,
    value: storedValue,
    reason: storedValue === "down" ? reason : null,
  });
}
