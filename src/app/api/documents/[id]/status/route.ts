import { getCurrentUser } from "@/lib/dal";
import { db } from "@/lib/db";

/** Lightweight status probe the upload panel polls while indexing runs. */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not allowed." }, { status: 403 });
  const { id } = await ctx.params;

  const { data: doc } = await db()
    .from("documents")
    .select("status, error, pages")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!doc) return Response.json({ error: "Document not found." }, { status: 404 });
  return Response.json({ status: doc.status, error: doc.error, pages: doc.pages });
}
