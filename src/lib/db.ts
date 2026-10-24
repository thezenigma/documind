import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Server-side Supabase client. The key never reaches the browser bundle, so
 * every query from the app passes through our owner filters in this codebase.
 * Only the service role key is accepted: row level security is enabled with
 * no policies, so the anon key would silently read empty results and make
 * writes no-ops. Failing fast beats silent data loss.
 */
export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL is not set.");
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Row level security is enabled on every table, so the app cannot fall back to the anon key. Add the service role key to .env.local.",
    );
  }
  client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
