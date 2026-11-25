import Link from "next/link";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { SensorIcon } from "@/components/icons";
import { ZoneReading } from "@/components/monitoring/zone-reading";
import { SimulatedBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { getAppContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/roles";
import { latestReadingsByZone, openAlertCount, timeAgo } from "@/lib/monitoring";

/** Live grid of every zone with its latest reading, plus the open-alert count. */
export async function LiveZones() {
  const ctx = await getAppContext();
  const [{ data: zones }, { data: warehouses }, open] = await Promise.all([
    ctx.supabase
      .from("storage_zones")
      .select("id, name, warehouse_id, min_temp_c, max_temp_c")
      .eq("company_id", ctx.company.companyId)
      .is("archived_at", null)
      .order("name"),
    ctx.supabase.from("warehouses").select("id, name").eq("company_id", ctx.company.companyId).is("archived_at", null),
    openAlertCount(ctx),
  ]);
  const whName = new Map((warehouses ?? []).map((w) => [w.id, w.name]));
  const active = (zones ?? []).filter((z) => whName.has(z.warehouse_id));
  const latest = await latestReadingsByZone(ctx, active.map((z) => z.id));
  const simulated = [...latest.values()].some((r) => r.source === "simulated");

  if (!warehouses?.length) {
    return (
      <EmptyState
        icon={<SensorIcon />}
        title="No warehouses yet"
        action={
          can.editCompany(ctx.role) ? (
            <Link href="/app/warehouses" className={buttonClasses({ size: "sm" })}>
              Add a warehouse
            </Link>
          ) : undefined
        }
      >
        Add a site, its storage zones and their temperature limits to start monitoring.
      </EmptyState>
    );
  }

  return (
    <section aria-labelledby="live-title" className="grid gap-4">
      <AutoRefresh seconds={30} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="live-title" className="type-h2 text-ink">
          Live zones
        </h2>
        {simulated ? <SimulatedBadge /> : null}
      </div>
      {open > 0 ? (
        <Callout
          tone="critical"
          title={`${open} ${open === 1 ? "alert needs" : "alerts need"} action`}
          action={
            <Link href="/app/alerts" className={buttonClasses({ size: "sm", variant: "secondary" })}>
              Open alerts
            </Link>
          }
        />
      ) : null}
      {active.length ? (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map((z) => {
            const r = latest.get(z.id);
            return (
              <li key={z.id}>
                <Link href={`/app/zones/${z.id}`} className="block rounded-panel transition-shadow hover:shadow-raise">
                  <ZoneReading
                    zoneName={z.name}
                    location={whName.get(z.warehouse_id) ?? ""}
                    temperatureC={r?.temperature_c ?? null}
                    humidityPct={r?.humidity_pct ?? null}
                    minC={z.min_temp_c}
                    maxC={z.max_temp_c}
                    updatedLabel={timeAgo(r?.recorded_at)}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="No zones yet">Open a warehouse and add its rooms, chillers or freezers.</EmptyState>
      )}
    </section>
  );
}
