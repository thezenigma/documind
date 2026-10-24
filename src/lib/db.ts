import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Server-side Supabase client. The key never reaches the browser bundle, so
 * every query from the app passes through our owner filters in this codebase.
 * Uses the service role key when present. Falls back to the anon key only for
 * local development before the service role key has been added, which works
 * while row level security is off and prints a warning.
 */
export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url) throw new Error("SUPABASE_URL is not set.");
  const key = serviceKey || anonKey;
  if (!key) throw new Error("No Supabase key set. Fill SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  if (!serviceKey) {
    console.warn("[db] SUPABASE_SERVICE_ROLE_KEY is empty, using the anon key for server-side access. Set the service role key before enabling row level security.");
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
