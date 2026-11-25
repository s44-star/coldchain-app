import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isServerEnvConfigured } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const reading = z.object({
  recorded_at: z.string().max(40).optional(),
  temperature_c: z.number().finite().nullable().optional(),
  humidity_pct: z.number().finite().nullable().optional(),
});
const body = z.union([z.object({ readings: z.array(reading).min(1).max(500) }), reading]);

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Sensor ingestion. Devices authenticate with their own key:
 *   POST /api/ingest/readings
 *   Authorization: Bearer cco_live_…
 *   { "temperature_c": 4.2, "humidity_pct": 61 }                 one reading, timestamped now
 *   { "readings": [{ "recorded_at": "…Z", "temperature_c": 4.2 }] } up to 500 buffered readings
 */
export async function POST(request: NextRequest) {
  if (!isServerEnvConfigured()) return json({ error: "Service not configured" }, 503);

  const header = request.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : (request.headers.get("x-device-key") ?? "").trim();
  if (!/^cco_live_[A-Za-z0-9]{32,64}$/.test(key)) return json({ error: "Missing or malformed device key" }, 401);

  if (!(await rateLimit(`ingest:${key.slice(0, 17)}`, 120, 60))) return json({ error: "Too many requests" }, 429);

  const raw = await request.text();
  if (raw.length > 262_144) return json({ error: "Payload too large" }, 413);
  let parsed: z.infer<typeof body>;
  try {
    const result = body.safeParse(JSON.parse(raw));
    if (!result.success) return json({ error: "Invalid payload", issues: result.error.issues.slice(0, 5).map((i) => i.message) }, 400);
    parsed = result.data;
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const admin = createAdminClient();
  const { data: credential } = await admin
    .from("sensor_api_keys")
    .select("id, sensor_id, expires_at, revoked_at")
    .eq("key_hash", createHash("sha256").update(key, "utf8").digest("hex"))
    .maybeSingle();

  if (!credential || credential.revoked_at || (credential.expires_at && new Date(credential.expires_at) < new Date())) {
    return json({ error: "Invalid device key" }, 401);
  }

  const now = new Date().toISOString();
  const items = ("readings" in parsed ? parsed.readings : [parsed]).map((r) => ({
    recorded_at: r.recorded_at ?? now,
    temperature_c: r.temperature_c ?? null,
    humidity_pct: r.humidity_pct ?? null,
  }));

  const { data: result, error } = await admin.rpc("ingest_readings", {
    p_sensor_id: credential.sensor_id,
    p_readings: items,
  });
  if (error) {
    if (error.code === "P0002") return json({ error: "Sensor is retired" }, 410);
    console.error("ingest failed", error.code, error.message);
    return json({ error: "Could not store readings" }, 500);
  }

  await admin.from("sensor_api_keys").update({ last_used_at: now }).eq("id", credential.id);
  return json(result);
}
