import { getCurrentUser } from "@/lib/dal";
import { db } from "@/lib/db";

/** Lists this user's conversations, newest first, with lightweight aggregate
    metadata so the history drawer can rank and label them without extra
    queries per row. */

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to see your conversations." }, { status: 403 });
  }

  const { data, error } = await db()
    .from("conversations")
    .select(`
      id,
      title,
      document_ids,
      created_at,
      messages ( count )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[conversations] list failed:", error.message);
    return Response.json({ error: "Could not load your conversations. Try again." }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    title: string;
    document_ids: string[] | null;
    created_at: string;
    messages: Array<{ count: number }> | null;
  }>;

  return Response.json({
    conversations: rows.map((r) => ({
      id: r.id,
      title: r.title,
      documentIds: r.document_ids ?? [],
      messageCount: r.messages?.[0]?.count ?? 0,
      createdAt: r.created_at,
    })),
  });
}
