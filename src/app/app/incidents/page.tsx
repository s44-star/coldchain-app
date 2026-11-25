import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { IncidentStatusBadge, SeverityBadge } from "@/components/status";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { getAppContext } from "@/lib/auth/context";
import { timeAgo } from "@/lib/monitoring";
import { cn } from "@/lib/utils";
import { NewIncidentForm } from "./forms";

export const metadata: Metadata = { title: "Incidents" };

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; alert?: string }>;
}) {
  const { view = "open", alert: alertId } = await searchParams;
  const ctx = await getAppContext();
  const companyId = ctx.company.companyId;

  let query = ctx.supabase
    .from("incidents")
    .select("id, title, status, severity, occurred_at, warehouse_id")
    .eq("company_id", companyId)
    .order("occurred_at", { ascending: false })
    .limit(100);
  query = view === "closed" ? query.in("status", ["resolved", "closed"]) : query.not("status", "in", "(resolved,closed)");

  const [{ data: incidents }, { data: warehouses }, { data: zones }, { data: alert }] = await Promise.all([
    query,
    ctx.supabase.from("warehouses").select("id, name").eq("company_id", companyId).is("archived_at", null).order("name"),
    ctx.supabase.from("storage_zones").select("id, name, warehouse_id").eq("company_id", companyId).is("archived_at", null).order("name"),
    alertId
      ? ctx.supabase.from("alerts").select("id, title, severity, warehouse_id, zone_id").eq("id", alertId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const whName = new Map((warehouses ?? []).map((w) => [w.id, w.name]));
  const canReport = ctx.role !== "viewer" && (warehouses?.length ?? 0) > 0;

  return (
    <>
      <PageHeader title="Incidents" description="Excursions and other events, with root cause, corrective action and evidence." />
      <div className="grid gap-6">
        {canReport ? (
          <Panel id="report">
            <PanelHeader title={alert ? "Report an incident for this alert" : "Report an incident"} />
            <PanelBody>
              <NewIncidentForm
                warehouses={(warehouses ?? []).map((w) => ({ id: w.id, name: w.name }))}
                zones={(zones ?? []).map((z) => ({ id: z.id, name: z.name, warehouseId: z.warehouse_id }))}
                defaults={
                  alert
                    ? {
                        alertId: alert.id,
                        warehouseId: alert.warehouse_id,
                        zoneId: alert.zone_id ?? undefined,
                        title: alert.title.replace(/^Simulated: /, ""),
                        severity: alert.severity,
                      }
                    : {}
                }
              />
            </PanelBody>
          </Panel>
        ) : null}

        <nav aria-label="Incident filter" className="flex gap-1">
          {[
            ["open", "Open"],
            ["closed", "Resolved and closed"],
          ].map(([key, label]) => (
            <Link
              key={key}
              href={`/app/incidents?view=${key}`}
              aria-current={view === key ? "page" : undefined}
              className={cn(
                "rounded-control px-3 py-1.5 type-small",
                view === key ? "bg-primary-soft font-medium text-primary" : "text-ink-muted hover:bg-surface-2",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        {incidents?.length ? (
          <ul className="grid gap-3">
            {incidents.map((i) => (
              <li key={i.id}>
                <Link href={`/app/incidents/${i.id}`} className="block rounded-panel border border-line bg-surface p-5 hover:shadow-raise">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid gap-1">
                      <p className="type-h3 text-ink">{i.title}</p>
                      <p className="type-small text-ink-muted">
                        {whName.get(i.warehouse_id)}, {timeAgo(i.occurred_at)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <SeverityBadge value={i.severity} />
                      <IncidentStatusBadge value={i.status} />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={view === "closed" ? "No closed incidents" : "No open incidents"}>
            {view === "closed" ? "Resolved incidents stay here with their full record." : "Report one when something goes wrong, or from an alert."}
          </EmptyState>
        )}
      </div>
    </>
  );
}
