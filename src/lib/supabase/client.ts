import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { requirePublicEnv } from "@/lib/env";

/**
 * Supabase client for Client Components. Holds only the publishable key and
 * the user's session; Row Level Security decides what it can reach.
 */
export function createClient() {
  const env = requirePublicEnv();
  return createBrowserClient<Database>(env.supabaseUrl, env.supabasePublishableKey);
}
