import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { getAppContext } from "@/lib/auth/context";
import { formatDateTime } from "@/lib/format";
import { sinceIso, timeAgo } from "@/lib/monitoring";
import { EquipmentForm, InspectionForm, ScheduleForm, TaskUpdateForm } from "./forms";

export const metadata: Metadata = { title: "Maintenance" };

const RESULT = { pass: { tone: "ok", label: "Pass" }, needs_attention: { tone: "warn", label: "Needs attention" }, fail: { tone: "critical", label: "Fail" } } as const;
const todayIso = () => new Date().toISOString().slice(0, 10);
const nowMs = () => Date.now();

export default async function MaintenancePage() {
  const ctx = await getAppContext();
  const companyId = ctx.company.companyId;

  const [{ data: warehouses }, { data: zones }, { data: equipment }, { data: openTasks }, { data: doneTasks }, { data: inspections }] =
    await Promise.all([
      ctx.supabase.from("warehouses").select("id, name").eq("company_id", companyId).is("archived_at", null).order("name"),
      ctx.supabase.from("storage_zones").select("id, name, warehouse_id").eq("company_id", companyId).is("archived_at", null).order("name"),
      ctx.supabase.from("equipment").select("id, name, category, warehouse_id, status").eq("company_id", companyId).is("archived_at", null).order("name"),
      ctx.supabase.from("maintenance_tasks").select("id, title, due_at, status, equipment_id").eq("company_id", companyId).in("status", ["pending", "in_progress"]).order("due_at"),
      ctx.supabase.from("maintenance_tasks").select("id, title, completed_at, notes, equipment_id").eq("company_id", companyId).eq("status", "completed").gte("completed_at", sinceIso(24 * 30)).order("completed_at", { ascending: false }).limit(20),
      ctx.supabase.from("inspections").select("id, inspected_at, result, findings, zone_id, equipment_id, warehouse_id").eq("company_id", companyId).order("inspected_at", { ascending: false }).limit(20),
    ]);

  const wh = (warehouses ?? []).map((w) => ({ id: w.id, name: w.name }));
  const zs = (zones ?? []).map((z) => ({ id: z.id, name: z.name, warehouseId: z.warehouse_id }));
  const eqs = (equipment ?? []).map((q) => ({ id: q.id, name: q.name, warehouseId: q.warehouse_id }));
  const eqName = new Map(eqs.map((q) => [q.id, q.name]));
  const zoneName = new Map(zs.map((z) => [z.id, z.name]));
  const now = nowMs();
  const canAct = ctx.role !== "viewer";
  const canManage = ctx.role !== "viewer" && ctx.role !== "operator";

  if (!wh.length) {
    return (
      <>
        <PageHeader title="Maintenance" />
        <EmptyState title="Add a warehouse first">Equipment and maintenance schedules belong to a warehouse.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Maintenance" description="Recurring work on equipment, and inspection records for audits." />
      <div className="grid gap-6">
        <Panel>
          <PanelHeader title="Tasks to do" description="Overdue tasks raise an alert." />
          {openTasks?.length ? (
            <ul className="divide-y divide-line">
              {openTasks.map((t) => {
                const overdue = new Date(t.due_at).getTime() < now;
                return (
                  <li key={t.id} className="grid gap-3 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="type-small font-semibold text-ink">{t.title}</p>
                        <p className="type-caption text-ink-muted">
                          {eqName.get(t.equipment_id)}, due {formatDateTime(t.due_at).split(",")[0]}
                        </p>
                      </div>
                      {overdue ? <Badge tone="critical" dot>Overdue</Badge> : <Badge tone="info">Upcoming</Badge>}
                    </div>
                    {canAct ? <TaskUpdateForm id={t.id} status={t.status} /> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-6 type-small text-ink-muted">No open tasks. Add a schedule below.</p>
          )}
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="Completed in the last 30 days" />
            {doneTasks?.length ? (
              <ul className="divide-y divide-line">
                {doneTasks.map((t) => (
                  <li key={t.id} className="px-5 py-3">
                    <p className="type-small font-medium text-ink">{t.title}</p>
                    <p className="type-caption text-ink-muted">
                      {eqName.get(t.equipment_id)}, done {timeAgo(t.completed_at)}
                      {t.notes ? `: ${t.notes}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 type-small text-ink-muted">Nothing completed yet.</p>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Recent inspections" />
            {inspections?.length ? (
              <Table caption="Recent inspections">
                <THead>
                  <tr>
                    <Th>Item</Th>
                    <Th>Result</Th>
                    <Th>When</Th>
                  </tr>
                </THead>
                <TBody>
                  {inspections.map((i) => (
                    <Tr key={i.id}>
                      <Td>{(i.zone_id && zoneName.get(i.zone_id)) || (i.equipment_id && eqName.get(i.equipment_id)) || "Item"}</Td>
                      <Td>
                        <Badge tone={RESULT[i.result].tone}>{RESULT[i.result].label}</Badge>
                      </Td>
                      <Td className="text-ink-muted">{timeAgo(i.inspected_at)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ) : (
              <p className="px-5 py-6 type-small text-ink-muted">No inspections recorded.</p>
            )}
          </Panel>
        </div>

        {canAct ? (
          <Panel>
            <PanelHeader title="Record an inspection" />
            <PanelBody>
              <InspectionForm warehouses={wh} zones={zs} equipment={eqs} />
            </PanelBody>
          </Panel>
        ) : null}

        {canManage ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel>
              <PanelHeader title="Add a maintenance schedule" />
              <PanelBody>
                <ScheduleForm equipment={eqs} warehouses={wh} today={todayIso()} />
              </PanelBody>
            </Panel>
            <Panel>
              <PanelHeader title="Add equipment" description={`${eqs.length} items registered.`} />
              <PanelBody>
                <EquipmentForm warehouses={wh} zones={zs} />
              </PanelBody>
            </Panel>
          </div>
        ) : null}
      </div>
    </>
  );
}
