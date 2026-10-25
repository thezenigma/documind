import "server-only";
import { db } from "./db";
import { readUsage } from "./rate-limit";

/**
 * F9 plan budgets, defined in one place. The ask route enforces the daily
 * question limit through the rate limiter with the same key, and
 * requestUpload enforces the document limit with the same counts, so the
 * meter and the enforcement never disagree about the numbers.
 */
export const PLANS = {
  free: { documents: 3, dailyQuestions: 30 },
  pro: { documents: 50, dailyQuestions: 500 },
} as const;

export type Usage = {
  plan: "free" | "pro";
  documentsUsed: number;
  documentLimit: number;
  questionsLeft: number;
  dailyQuestionLimit: number;
};

export async function getUsage(plan: "free" | "pro", userId: string): Promise<Usage> {
  const budget = PLANS[plan];
  const { count, error } = await db()
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) console.error("[usage] document count failed:", error.message);
  const questionsUsed = await readUsage(`ask:${userId}`, 86_400);
  return {
    plan,
    documentsUsed: (error ? null : count) ?? 0,
    documentLimit: budget.documents,
    dailyQuestionLimit: budget.dailyQuestions,
    questionsLeft: Math.max(0, budget.dailyQuestions - questionsUsed),
  };
}
