import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { PageHeader } from "@/components/app/page-header";
import { AlertStatusBadge, SeverityBadge } from "@/components/status";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { getAppContext } from "@/lib/auth/context";
import { ALERT_TYPES } from "@/lib/labels";
import { timeAgo } from "@/lib/monitoring";
import { cn } from "@/lib/utils";
import { AlertActions } from "../monitoring-forms";

export const metadata: Metadata = { title: "Alerts" };

const TABS = [
  { key: "active", label: "Needs action" },
  { key: "resolved", label: "Resolved" },
] as const;

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view = "active" } = await searchParams;
  const ctx = await getAppContext();

  let query = ctx.supabase
    .from("alerts")
    .select("id, title, message, type, severity, status, opened_at, last_triggered_at, trigger_count, warehouse_id, zone_id")
    .eq("company_id", ctx.company.companyId)
    .order("opened_at", { ascending: false })
    .limit(100);
  query = view === "resolved" ? query.eq("status", "resolved") : query.neq("status", "resolved");

  const [{ data: alerts }, { data: warehouses }] = await Promise.all([
    query,
    ctx.supabase.from("warehouses").select("id, name").eq("company_id", ctx.company.companyId),
  ]);
  const whName = new Map((warehouses ?? []).map((w) => [w.id, w.name]));
  const canAct = ctx.role !== "viewer";

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader title="Alerts" description="Readings outside their limits and sensors that stopped reporting." />

      <nav aria-label="Alert filter" className="mb-6 flex gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/app/alerts?view=${t.key}`}
            aria-current={view === t.key ? "page" : undefined}
            className={cn(
              "rounded-control px-3 py-1.5 type-small",
              view === t.key ? "bg-primary-soft font-medium text-primary" : "text-ink-muted hover:bg-surface-2",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {alerts?.length ? (
        <ul className="grid gap-3">
          {alerts.map((a) => (
            <li key={a.id}>
              <Panel className={cn("grid gap-3 p-5", a.status === "open" && a.severity === "critical" && "border-critical/40")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <Link href={`/app/alerts/${a.id}`} className="type-h3 text-ink underline-offset-4 hover:underline">
                      {a.title}
                    </Link>
                    <p className="type-small text-ink-muted">
                      {whName.get(a.warehouse_id)} · {ALERT_TYPES[a.type]} · opened {timeAgo(a.opened_at)}
                      {a.trigger_count > 1 ? `, seen ${a.trigger_count} times` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <SeverityBadge value={a.severity} />
                    <AlertStatusBadge value={a.status} />
                  </div>
                </div>
                {a.message ? <p className="type-small text-ink">{a.message}</p> : null}
                {canAct ? <AlertActions alertId={a.id} status={a.status} /> : null}
              </Panel>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={view === "resolved" ? "No resolved alerts yet" : "Nothing needs action"}>
          {view === "resolved" ? "Resolved alerts and their notes are kept here." : "Every zone is within its limits and every sensor is reporting."}
        </EmptyState>
      )}
    </>
  );
}
