import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { PageHeader } from "@/components/app/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/form-parts";
import { SensorIcon } from "@/components/icons";
import { ZoneReading } from "@/components/monitoring/zone-reading";
import { SensorStatusBadge } from "@/components/status";
import { SimulatedBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/form";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { getAppContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/roles";
import { countryName } from "@/lib/countries";
import { WAREHOUSE_TYPES } from "@/lib/labels";
import { latestReadingsByZone, timeAgo } from "@/lib/monitoring";
import { SensorForm, ZoneForm } from "../../monitoring-forms";
import { archiveWarehouse, assignManager, unassignManager } from "../actions";
import { WarehouseForm } from "../warehouse-form";

export const metadata: Metadata = { title: "Warehouse" };

export default async function WarehousePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAppContext();

  const { data: w } = await ctx.supabase.from("warehouses").select("*").eq("id", id).maybeSingle();
  if (!w || w.company_id !== ctx.company.companyId) notFound();

  const [{ data: zones }, { data: sensors }, { data: assignments }, { data: members }] = await Promise.all([
    ctx.supabase.from("storage_zones").select("*").eq("warehouse_id", id).is("archived_at", null).order("name"),
    ctx.supabase.from("sensors").select("id, name, external_device_id, status, zone_id, last_reading_at").eq("warehouse_id", id).is("archived_at", null).order("name"),
    ctx.supabase.from("warehouse_assignments").select("id, user_id").eq("warehouse_id", id),
    ctx.supabase.from("company_members").select("user_id, role").eq("company_id", ctx.company.companyId),
  ]);

  const isAdmin = can.editCompany(ctx.role);
  // Mirrors private.managed_warehouse_ids(): owners/admins everywhere, managers where assigned.
  const canManage = isAdmin || (ctx.role === "warehouse_manager" && (assignments ?? []).some((a) => a.user_id === ctx.userId));
  const latest = await latestReadingsByZone(ctx, (zones ?? []).map((z) => z.id));
  const anySimulated = [...latest.values()].some((r) => r.source === "simulated");

  const managerIds = (members ?? []).filter((m) => m.role === "warehouse_manager").map((m) => m.user_id);
  const { data: people } = managerIds.length
    ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", managerIds)
    : { data: [] };
  const personName = (uid: string) => {
    const p = (people ?? []).find((x) => x.id === uid);
    return p?.full_name || p?.email || "Manager";
  };
  const assignedIds = new Set((assignments ?? []).map((a) => a.user_id));

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader
        title={w.name}
        description={[WAREHOUSE_TYPES[w.type], w.city, countryName(w.country_code), w.timezone].filter(Boolean).join(", ")}
        actions={anySimulated ? <SimulatedBadge /> : undefined}
      />

      <div className="grid gap-8">
        <section aria-labelledby="zones-title" className="grid gap-4">
          <h2 id="zones-title" className="type-h2 text-ink">
            Zones
          </h2>
          {zones?.length ? (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {zones.map((z) => {
                const r = latest.get(z.id);
                return (
                  <li key={z.id}>
                    <Link href={`/app/zones/${z.id}`} className="block rounded-panel transition-shadow hover:shadow-raise">
                      <ZoneReading
                        zoneName={z.name}
                        location={(sensors ?? []).filter((s) => s.zone_id === z.id).length + " sensors"}
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
            <EmptyState title="No zones yet">
              {canManage ? "Add rooms, chillers or freezers below and set their limits." : "A manager of this warehouse can add zones."}
            </EmptyState>
          )}
        </section>

        <Panel>
          <PanelHeader title="Sensors" description="Each logger reports with its own device key." />
          {sensors?.length ? (
            <Table caption="Sensors">
              <THead>
                <tr>
                  <Th>Sensor</Th>
                  <Th>Zone</Th>
                  <Th>Status</Th>
                  <Th>Last reading</Th>
                </tr>
              </THead>
              <TBody>
                {sensors.map((s) => (
                  <Tr key={s.id}>
                    <Td>
                      <Link href={`/app/sensors/${s.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                        {s.name}
                      </Link>
                      <span className="block type-caption text-ink-muted">{s.external_device_id}</span>
                    </Td>
                    <Td className="text-ink-muted">{(zones ?? []).find((z) => z.id === s.zone_id)?.name ?? "Not placed"}</Td>
                    <Td>
                      <SensorStatusBadge value={s.status} />
                    </Td>
                    <Td className="tabular text-ink-muted">{timeAgo(s.last_reading_at)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <div className="p-5">
              <EmptyState icon={<SensorIcon />} title="No sensors registered">
                Register each data logger, then give it a device key so it can send readings.
              </EmptyState>
            </div>
          )}
        </Panel>

        {canManage ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel>
              <PanelHeader title="Add a zone" />
              <PanelBody>
                <ZoneForm warehouseId={id} />
              </PanelBody>
            </Panel>
            <Panel>
              <PanelHeader title="Register a sensor" />
              <PanelBody>
                <SensorForm warehouseId={id} zones={(zones ?? []).map((z) => ({ id: z.id, name: z.name }))} />
              </PanelBody>
            </Panel>
          </div>
        ) : null}

        {isAdmin ? (
          <>
            <Panel>
              <PanelHeader title="Warehouse managers" description="Managers can configure only the warehouses assigned to them." />
              <PanelBody className="grid gap-4">
                {(assignments ?? []).length ? (
                  <ul className="grid gap-2">
                    {(assignments ?? []).map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 type-small">
                        <span className="text-ink">{personName(a.user_id)}</span>
                        <ActionForm action={unassignManager} hidden={{ id: a.id, warehouseId: id }}>
                          <SubmitButton size="sm" variant="ghost" pendingLabel="Removing">
                            Remove
                          </SubmitButton>
                        </ActionForm>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="type-small text-ink-muted">No managers assigned. Owners and admins can manage every warehouse.</p>
                )}
                {managerIds.filter((uid) => !assignedIds.has(uid)).length ? (
                  <ActionForm action={assignManager} hidden={{ warehouseId: id }}>
                    <label htmlFor="assign-user" className="sr-only">
                      Manager to assign
                    </label>
                    <Select id="assign-user" name="userId" className="w-64">
                      {managerIds
                        .filter((uid) => !assignedIds.has(uid))
                        .map((uid) => (
                          <option key={uid} value={uid}>
                            {personName(uid)}
                          </option>
                        ))}
                    </Select>
                    <SubmitButton size="sm" variant="secondary" pendingLabel="Assigning">
                      Assign
                    </SubmitButton>
                  </ActionForm>
                ) : (
                  <p className="type-caption text-ink-muted">
                    To assign someone, give them the Warehouse manager role on the Team page.
                  </p>
                )}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Warehouse details" />
              <PanelBody>
                <WarehouseForm
                  id={id}
                  initial={{
                    name: w.name,
                    code: w.code ?? "",
                    type: w.type,
                    countryCode: w.country_code,
                    city: w.city ?? "",
                    addressLine1: w.address_line1 ?? "",
                    timezone: w.timezone,
                    contactName: w.contact_name ?? "",
                    contactPhone: w.contact_phone ?? "",
                  }}
                />
              </PanelBody>
            </Panel>

            <ActionForm
              action={archiveWarehouse}
              hidden={{ id }}
              confirm={`Archive ${w.name}? It disappears from dashboards; its history stays in reports.`}
            >
              <SubmitButton variant="danger" size="sm" pendingLabel="Archiving">
                Archive warehouse
              </SubmitButton>
            </ActionForm>
          </>
        ) : null}
      </div>
    </>
  );
}
