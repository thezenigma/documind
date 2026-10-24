import { getCurrentUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { UUID_RE } from "../../ask/route";

/** Removes one conversation and its messages. Owner-scoped only. */

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to delete a conversation." }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return Response.json({ error: "That conversation id is not valid." }, { status: 400 });
  }

  // Verify ownership before touching any rows, then delete messages
  // explicitly so the conversation removal never depends on an FK cascade
  // that may not exist in the remote schema.
  const { data: conversation, error: lookupError } = await db()
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupError) {
    console.error("[conversations] lookup failed:", lookupError.message);
    return Response.json({ error: "Could not delete this conversation. Try again." }, { status: 500 });
  }
  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const { error: msgError } = await db()
    .from("messages")
    .delete()
    .eq("conversation_id", id);

  if (msgError) {
    console.error("[conversations] message delete failed:", msgError.message);
    return Response.json({ error: "Could not delete this conversation. Try again." }, { status: 500 });
  }

  const { error: convError } = await db()
    .from("conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (convError) {
    console.error("[conversations] delete failed:", convError.message);
    return Response.json({ error: "Could not delete this conversation. Try again." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
