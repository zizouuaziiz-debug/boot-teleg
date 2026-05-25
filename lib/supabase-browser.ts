/**
 * Browser-only Supabase client (uses the public ANON key).
 * Used exclusively for Realtime subscriptions on the client side.
 * NEVER use this for DB mutations — use server-side API routes instead.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _browserClient: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (_browserClient) return _browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  _browserClient = createClient(url, key, {
    realtime: {
      params: { eventsPerSecond: 10 },
    },
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
  });

  return _browserClient;
}
