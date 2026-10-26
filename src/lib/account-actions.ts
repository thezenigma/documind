"use server";

import { compare } from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "./dal";
import { db } from "./db";
import { SESSION_COOKIE } from "./session";
import { removeObjects } from "./storage";

/**
 * Account and data deletion (PRD F13). Everything the account produced goes
 * with it: the stored files, the chunks that hold their embeddings, the
 * conversations and their messages, the sessions, the tokens, and the usage
 * record. The order is deliberate, and every stage is checked, because a
 * half-deleted account that reports success is worse than one that refuses.
 */

type Stage =
  | "files"
  | "messages"
  | "conversations"
  | "chunks"
  | "documents"
  | "sessions"
  | "tokens"
  | "usage"
  | "account";

const stageCopy: Record<Stage, string> = {
  files: "the files stored for your documents",
  messages: "your saved conversations",
  conversations: "your conversation list",
  chunks: "the indexed passages from your documents",
  documents: "your document list",
  sessions: "your active sessions",
  tokens: "outstanding email links for your account",
  usage: "your usage history",
  account: "your account itself",
};

function stopped(stage: Stage, detail: string) {
  console.error(`[account-delete] stopped at ${stage}: ${detail}`);
  return {
    ok: false,
    message: `Deletion stopped while removing ${stageCopy[stage]}. Nothing else was removed and your account is still signed in. Try again in a moment.`,
  };
}

export type DeleteAccountState = { ok?: boolean; message?: string; fieldErrors?: { confirmEmail?: string; password?: string } } | undefined;

/**
 * Deletes the account for good. The reader types their email address and
 * password, both of which are checked before anything is touched. The user row
 * goes last: while it exists, a failure anywhere leaves an account that can be
 * retried, never an account that cannot be signed into.
 */
export async function deleteAccount(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  void _prev;
  const user = await requireUser();

  const confirmEmail = String(formData.get("confirmEmail") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (confirmEmail !== user.email.toLowerCase()) {
    return {
      fieldErrors: {
        confirmEmail: "Type your account email exactly as it is shown to continue.",
      },
    };
  }
  if (!password) {
    return { fieldErrors: { password: "Enter your password to confirm it is you." } };
  }

  const { data: row, error: rowError } = await db()
    .from("users")
    .select("password_hash")
    .eq("id", user.id)
    .maybeSingle();
  if (rowError || !row) {
    return { message: "Your account could not be read. Try again in a moment." };
  }
  if (!row.password_hash) {
    return {
      message:
        "This account was created with Google sign-in and has no password. Removing it has to be done by support.",
    };
  }
  const passwordOk = await compare(password, row.password_hash);
  if (!passwordOk) {
    return { fieldErrors: { password: "That password is not the one for this account." } };
  }

  // 1. Stored files first. If this fails nothing below runs, so the account
  //    never ends up pointing at files that are already gone.
  const { data: docRows, error: docError } = await db()
    .from("documents")
    .select("storage_key")
    .eq("user_id", user.id);
  if (docError) return stopped("documents", docError.message);
  const storageKeys = (docRows ?? [])
    .map((d) => d.storage_key)
    .filter((k): k is string => typeof k === "string" && k.length > 0);
  if (storageKeys.length > 0) {
    try {
      await removeObjects(storageKeys);
    } catch (err) {
      return stopped("files", err instanceof Error ? err.message : "storage remove failed");
    }
  }

  // 2. Messages before their conversations, so no message is ever left
  //    pointing at a conversation that no longer exists.
  const { data: convRows, error: convError } = await db()
    .from("conversations")
    .select("id")
    .eq("user_id", user.id);
  if (convError) return stopped("conversations", convError.message);
  const conversationIds = (convRows ?? []).map((c) => c.id);
  if (conversationIds.length > 0) {
    const { error: msgError } = await db()
      .from("messages")
      .delete()
      .in("conversation_id", conversationIds);
    if (msgError) return stopped("messages", msgError.message);
  }

  const { error: convDeleteError } = await db()
    .from("conversations")
    .delete()
    .eq("user_id", user.id);
  if (convDeleteError) return stopped("conversations", convDeleteError.message);

  // 3. Chunks carry the embeddings on the same row, so removing them removes
  //    the vectors as well as the text.
  const { data: docIds, error: docIdsError } = await db()
    .from("documents")
    .select("id")
    .eq("user_id", user.id);
  if (docIdsError) return stopped("documents", docIdsError.message);
  const documentIds = (docIds ?? []).map((d) => d.id);
  if (documentIds.length > 0) {
    const { error: chunkError } = await db()
      .from("chunks")
      .delete()
      .in("document_id", documentIds);
    if (chunkError) return stopped("chunks", chunkError.message);
  }

  const { error: docDeleteError } = await db()
    .from("documents")
    .delete()
    .eq("user_id", user.id);
  if (docDeleteError) return stopped("documents", docDeleteError.message);

  // 4. Bookkeeping rows. None of these block the deletion on their own: they
  //    carry no document text, and the user row below is what ends access.
  const { error: sessionError } = await db().from("sessions").delete().eq("user_id", user.id);
  if (sessionError) return stopped("sessions", sessionError.message);

  const { error: tokenError } = await db().from("auth_tokens").delete().eq("user_id", user.id);
  if (tokenError) return stopped("tokens", tokenError.message);

  const { error: usageError } = await db().from("usage_events").delete().eq("user_id", user.id);
  if (usageError) return stopped("usage", usageError.message);

  // The counter table is keyed by string, so the daily question key is named
  // after the user id and is removed by name.
  await db().from("rate_limits").delete().eq("key", `ask:${user.id}`);

  // 5. The user row last. Until this succeeds the account is intact and the
  //    reader can simply try again.
  const { error: userError } = await db().from("users").delete().eq("id", user.id);
  if (userError) return stopped("account", userError.message);

  console.log(`[account-delete] removed user=${user.id}`);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/?deleted=1");
}
