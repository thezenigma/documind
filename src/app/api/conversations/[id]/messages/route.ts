import { getCurrentUser } from "@/lib/dal";
import { db } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Restores a single conversation for the ask screen: its document ids (so
    the panel can reopen the same set) and its messages in chronological order
    with each message's stored citations. For refusals the stored citations are
    the closest-passage records, so the restored refusal keeps its context. */

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to view this conversation." }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return Response.json({ error: "That conversation id is not valid." }, { status: 400 });
  }

  const { data: conversation, error: convError } = await db()
    .from("conversations")
    .select("id, title, document_ids, created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (convError) {
    console.error("[conversations] lookup failed:", convError.message);
    return Response.json({ error: "Could not load this conversation. Try again." }, { status: 500 });
  }
  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const { data: messages } = await db()
    .from("messages")
    .select("id, role, content, citations, feedback, feedback_reason, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  const messageRows = (messages ?? []) as Array<{
    id: string;
    role: string;
    content: string;
    citations: Array<Record<string, unknown>> | null;
    feedback: "up" | "down" | null;
    feedback_reason: string | null;
    created_at: string;
  }>;

  return Response.json({
    id: conversation.id,
    title: conversation.title,
    documentIds: conversation.document_ids ?? [],
    createdAt: conversation.created_at,
    messages: messageRows.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      citations: m.citations ?? [],
      feedback: m.role === "assistant" ? m.feedback ?? null : null,
      feedbackReason: m.role === "assistant" ? m.feedback_reason ?? null : null,
      createdAt: m.created_at,
    })),
  });
}
