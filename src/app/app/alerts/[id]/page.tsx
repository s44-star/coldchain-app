import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { AlertStatusBadge, SeverityBadge } from "@/components/status";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { getAppContext } from "@/lib/auth/context";
import { formatDateTime } from "@/lib/format";
import { ALERT_TYPES } from "@/lib/labels";
import { AlertActions } from "../../monitoring-forms";

export const metadata: Metadata = { title: "Alert" };

const EVENT_LABEL: Record<string, string> = {
  created: "Alert raised",
  acknowledged: "Acknowledged",
  assigned: "Assigned",
  resolved: "Resolved",
  reopened: "Reopened",
  retriggered: "Seen again",
};

export default async function AlertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAppContext();
  const { data: a } = await ctx.supabase.from("alerts").select("*").eq("id", id).maybeSingle();
  if (!a || a.company_id !== ctx.company.companyId) notFound();

  const [{ data: events }, { data: warehouse }, { data: zone }] = await Promise.all([
    ctx.supabase.from("alert_events").select("*").eq("alert_id", id).order("created_at", { ascending: false }).limit(100),
    ctx.supabase.from("warehouses").select("name, timezone").eq("id", a.warehouse_id).single(),
    a.zone_id ? ctx.supabase.from("storage_zones").select("id, name").eq("id", a.zone_id).single() : Promise.resolve({ data: null }),
  ]);
  const actorIds = [...new Set((events ?? []).flatMap((e) => [e.actor_id, e.assigned_to]).filter((x): x is string => !!x))];
  const { data: people } = actorIds.length
    ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] };
  const who = (uid: string | null) => {
    if (!uid) return "ColdChain OS";
    const p = (people ?? []).find((x) => x.id === uid);
    return p?.full_name || p?.email || "Team member";
  };
  const tz = warehouse?.timezone ?? "UTC";

  return (
    <>
      <PageHeader
        title={a.title}
        description={
          <>
            {warehouse?.name}
            {zone ? (
              <>
                {", "}
                <Link href={`/app/zones/${zone.id}`} className="text-primary underline-offset-4 hover:underline">
                  {zone.name}
                </Link>
              </>
            ) : null}
            {`. ${ALERT_TYPES[a.type]}.`}
          </>
        }
        actions={
          <>
            <SeverityBadge value={a.severity} />
            <AlertStatusBadge value={a.status} />
          </>
        }
      />
      <div className="grid gap-6">
        {a.message ? <p className="type-body text-ink">{a.message}</p> : null}
        {ctx.role !== "viewer" ? <AlertActions alertId={a.id} status={a.status} /> : null}
        {a.resolution_notes ? (
          <Panel>
            <PanelHeader title="Resolution" />
            <PanelBody className="type-body text-ink">{a.resolution_notes}</PanelBody>
          </Panel>
        ) : null}
        <Panel>
          <PanelHeader title="History" description={`Times in ${tz}.`} />
          <PanelBody>
            <ol className="grid gap-4">
              {(events ?? []).map((e) => (
                <li key={e.id} className="grid gap-0.5 border-l-2 border-line pl-4">
                  <p className="type-small font-medium text-ink">
                    {EVENT_LABEL[e.event_type] ?? e.event_type}
                    {e.event_type === "assigned" ? ` to ${who(e.assigned_to)}` : ""}
                    <span className="font-normal text-ink-muted"> by {who(e.actor_id)}</span>
                  </p>
                  <p className="type-caption tabular text-ink-muted">{formatDateTime(e.created_at, tz)}</p>
                  {e.note && e.event_type !== "created" ? <p className="type-small text-ink">{e.note}</p> : null}
                </li>
              ))}
            </ol>
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
