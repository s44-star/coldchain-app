import "server-only";

import type { AppContext } from "@/lib/auth/context";
import type { Tables } from "@/types/database";

export type LatestReading = Pick<
  Tables<"sensor_readings">,
  "zone_id" | "temperature_c" | "humidity_pct" | "recorded_at" | "source" | "quality"
>;

/** Latest valid reading per zone (from the last 7 days), keyed by zone id. */
export async function latestReadingsByZone(ctx: AppContext, zoneIds: string[]): Promise<Map<string, LatestReading>> {
  const latest = new Map<string, LatestReading>();
  if (!zoneIds.length) return latest;

  // One query per zone keeps each lookup on the (zone_id, recorded_at) index.
  const results = await Promise.all(
    zoneIds.map((zoneId) =>
      ctx.supabase
        .from("sensor_readings")
        .select("zone_id, temperature_c, humidity_pct, recorded_at, source, quality")
        .eq("zone_id", zoneId)
        .neq("quality", "invalid")
        .gte("recorded_at", sinceIso(7 * 24))
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  );
  for (const { data } of results) if (data?.zone_id) latest.set(data.zone_id, data);
  return latest;
}

export function sinceIso(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

/** "3 min ago", "2 h ago", "4 days ago". */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export async function openAlertCount(ctx: AppContext): Promise<number> {
  const { count } = await ctx.supabase
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .eq("company_id", ctx.company.companyId)
    .neq("status", "resolved");
  return count ?? 0;
}
