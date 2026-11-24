import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getPublicEnv, isServerEnvConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

type Check = "ok" | "missing" | "error";

/**
 * Deployment check. Reports whether configuration is present and whether the
 * database answers, without revealing any values.
 */
export async function GET() {
  const env = getPublicEnv();
  const checks: { config: Check; serverConfig: Check; database: Check } = {
    config: env ? "ok" : "missing",
    serverConfig: isServerEnvConfigured() ? "ok" : "missing",
    database: "missing",
  };

  if (env) {
    try {
      const supabase = createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await supabase
        .from("subscription_plans")
        .select("id", { count: "exact", head: true })
        .abortSignal(AbortSignal.timeout(3000));
      checks.database = error ? "error" : "ok";
      if (error) console.error("health: database check failed", error.message);
    } catch (error) {
      checks.database = "error";
      console.error("health: database check threw", error);
    }
  }

  const healthy = Object.values(checks).every((value) => value === "ok");
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      checks,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
