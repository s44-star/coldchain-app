import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { requireServerEnv } from "@/lib/env";

/**
 * Service-role client. It bypasses Row Level Security, so it is used in
 * exactly three places, each of which authenticates its caller first:
 *   - payment webhooks   (HMAC signature)
 *   - sensor ingestion   (hashed device key)
 *   - cron jobs          (CRON_SECRET)
 */
export function createAdminClient() {
  const env = requireServerEnv();
  return createClient<Database>(env.supabaseUrl, env.supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
