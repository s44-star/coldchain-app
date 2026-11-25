import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/form-parts";
import { SensorStatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { getAppContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/roles";
import { SENSOR_TYPES } from "@/lib/labels";
import { timeAgo } from "@/lib/monitoring";
import { siteOrigin } from "@/lib/rate-limit";
import { DeviceKeyForm, SensorZoneForm, SimulateForm } from "../../monitoring-forms";
import { retireSensor, revokeDeviceKey } from "../actions";

export const metadata: Metadata = { title: "Sensor" };

export default async function SensorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAppContext();

  const { data: s } = await ctx.supabase.from("sensors").select("*").eq("id", id).maybeSingle();
  if (!s || s.company_id !== ctx.company.companyId) notFound();

  const [{ data: warehouse }, { data: zones }, { data: keys }, { data: assignments }] = await Promise.all([
    ctx.supabase.from("warehouses").select("id, name").eq("id", s.warehouse_id).single(),
    ctx.supabase.from("storage_zones").select("id, name").eq("warehouse_id", s.warehouse_id).is("archived_at", null).order("name"),
    ctx.supabase.from("sensor_api_keys").select("id, name, key_prefix, created_at, last_used_at, revoked_at").eq("sensor_id", id).order("created_at", { ascending: false }),
    ctx.supabase.from("warehouse_assignments").select("user_id").eq("warehouse_id", s.warehouse_id),
  ]);

  const canManage = can.editCompany(ctx.role) || (ctx.role === "warehouse_manager" && (assignments ?? []).some((a) => a.user_id === ctx.userId));
  const zone = (zones ?? []).find((z) => z.id === s.zone_id);
  const endpoint = `${await siteOrigin()}/api/ingest/readings`;
  const retired = s.status === "retired";

  return (
    <>
      <PageHeader
        title={s.name}
        description={
          <>
            <Link href={`/app/warehouses/${s.warehouse_id}`} className="text-primary underline-offset-4 hover:underline">
              {warehouse?.name}
            </Link>
            {zone ? (
              <>
                {", "}
                <Link href={`/app/zones/${zone.id}`} className="text-primary underline-offset-4 hover:underline">
                  {zone.name}
                </Link>
              </>
            ) : ", not placed in a zone"}
          </>
        }
        actions={<SensorStatusBadge value={s.status} />}
      />

      <div className="grid gap-6">
        <Panel>
          <PanelBody className="grid gap-4 py-5 sm:grid-cols-3">
            <div>
              <p className="type-caption text-ink-muted">Device ID</p>
              <p className="type-small font-medium text-ink">{s.external_device_id}</p>
            </div>
            <div>
              <p className="type-caption text-ink-muted">Measures</p>
              <p className="type-small font-medium text-ink">{SENSOR_TYPES[s.type]}</p>
            </div>
            <div>
              <p className="type-caption text-ink-muted">Last reading</p>
              <p className="type-small font-medium text-ink">{timeAgo(s.last_reading_at)}</p>
            </div>
          </PanelBody>
        </Panel>

        {canManage && !retired ? (
          <>
            <Panel>
              <PanelHeader title="Device keys" description="The logger sends this key with every reading. Create one per device; withdraw it if a device is lost." />
              <PanelBody className="grid gap-5">
                <DeviceKeyForm sensorId={id} />
                {keys?.length ? (
                  <Table caption="Device keys">
                    <THead>
                      <tr>
                        <Th>Key</Th>
                        <Th>Last used</Th>
                        <Th>Status</Th>
                        <Th className="text-right">
                          <span className="sr-only">Actions</span>
                        </Th>
                      </tr>
                    </THead>
                    <TBody>
                      {keys.map((k) => (
                        <Tr key={k.id}>
                          <Td>
                            <span className="font-mono text-xs">{k.key_prefix}…</span>
                            {k.name ? <span className="block type-caption text-ink-muted">{k.name}</span> : null}
                          </Td>
                          <Td className="tabular text-ink-muted">{timeAgo(k.last_used_at)}</Td>
                          <Td>{k.revoked_at ? <Badge>Withdrawn</Badge> : <Badge tone="ok">Active</Badge>}</Td>
                          <Td className="text-right">
                            {!k.revoked_at ? (
                              <ActionForm action={revokeDeviceKey} hidden={{ id: k.id, sensorId: id }} className="justify-end" confirm="Withdraw this key? The device stops reporting until it gets a new one.">
                                <SubmitButton size="sm" variant="ghost" pendingLabel="Withdrawing">
                                  Withdraw
                                </SubmitButton>
                              </ActionForm>
                            ) : null}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                ) : null}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Connect the logger" description="Give this to whoever sets up the device." />
              <PanelBody className="grid gap-3 type-small text-ink-muted">
                <p>
                  Send an HTTPS <strong className="text-ink">POST</strong> to the address below with the device key in the{" "}
                  <code className="text-ink">Authorization</code> header. Readings appear within seconds.
                </p>
                <pre className="overflow-x-auto rounded-control bg-surface-2 p-4 font-mono text-xs leading-relaxed text-ink">
{`POST ${endpoint}
Authorization: Bearer <device key>
Content-Type: application/json

{ "temperature_c": 4.2, "humidity_pct": 61 }

// or up to 500 buffered readings:
{ "readings": [
  { "recorded_at": "2026-11-25T14:35:00Z", "temperature_c": 4.2 }
] }`}
                </pre>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Placement" />
              <PanelBody>
                <SensorZoneForm sensorId={id} zoneId={s.zone_id} zones={zones ?? []} />
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Simulated data" description="For demos and training without hardware." />
              <PanelBody className="grid gap-4">
                <Callout tone="warn" title="Simulated readings are labelled everywhere">
                  They show a Simulated data badge on dashboards and reports, and alerts they raise start with “Simulated”.
                </Callout>
                {s.zone_id ? <SimulateForm sensorId={id} /> : <p className="type-small text-ink-muted">Place the sensor in a zone first.</p>}
              </PanelBody>
            </Panel>

            <ActionForm action={retireSensor} hidden={{ id }} confirm={`Retire ${s.name}? Its keys stop working; its readings stay in reports.`}>
              <SubmitButton size="sm" variant="danger" pendingLabel="Retiring">
                Retire sensor
              </SubmitButton>
            </ActionForm>
          </>
        ) : retired ? (
          <Callout tone="info" title="This sensor is retired">Its readings remain in reports.</Callout>
        ) : null}
      </div>
    </>
  );
}
