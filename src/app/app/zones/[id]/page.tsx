import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { PageHeader } from "@/components/app/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/form-parts";
import { BandGauge } from "@/components/monitoring/zone-reading";
import { ReadingChart } from "@/components/monitoring/reading-chart";
import { Badge, SimulatedBadge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { getAppContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/roles";
import { excursionState, formatDateTime, formatHumidity, formatRange, formatTemperature } from "@/lib/format";
import { ZONE_TYPES } from "@/lib/labels";
import { sinceIso, timeAgo } from "@/lib/monitoring";
import { cn } from "@/lib/utils";
import { ManualReadingForm, ZoneForm } from "../../monitoring-forms";
import { archiveZone } from "../actions";

export const metadata: Metadata = { title: "Zone" };

const SOURCE_LABEL = { device: "Sensor", manual: "Manual", simulated: "Simulated" } as const;

export default async function ZonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAppContext();

  const { data: z } = await ctx.supabase.from("storage_zones").select("*").eq("id", id).maybeSingle();
  if (!z || z.company_id !== ctx.company.companyId) notFound();

  const [{ data: warehouse }, { data: readings }, { data: sensors }, { data: assignments }] = await Promise.all([
    ctx.supabase.from("warehouses").select("id, name, timezone").eq("id", z.warehouse_id).single(),
    ctx.supabase
      .from("sensor_readings")
      .select("id, recorded_at, temperature_c, humidity_pct, source, quality, sensor_id")
      .eq("zone_id", id)
      .gte("recorded_at", sinceIso(24))
      .order("recorded_at", { ascending: true })
      .limit(2000),
    ctx.supabase.from("sensors").select("id, name").eq("zone_id", id).is("archived_at", null),
    ctx.supabase.from("warehouse_assignments").select("user_id").eq("warehouse_id", z.warehouse_id),
  ]);

  const tz = warehouse?.timezone ?? "UTC";
  const valid = (readings ?? []).filter((r) => r.quality !== "invalid");
  const latest = valid.at(-1);
  const state = excursionState(latest?.temperature_c, z.min_temp_c, z.max_temp_c);
  const hasSimulated = (readings ?? []).some((r) => r.source === "simulated");
  const canManage = can.editCompany(ctx.role) || (ctx.role === "warehouse_manager" && (assignments ?? []).some((a) => a.user_id === ctx.userId));
  const canRecord = ctx.role !== "viewer";
  const recent = [...(readings ?? [])].reverse().slice(0, 30);

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader
        title={z.name}
        description={
          <>
            <Link href={`/app/warehouses/${z.warehouse_id}`} className="text-primary underline-offset-4 hover:underline">
              {warehouse?.name}
            </Link>
            {`, ${ZONE_TYPES[z.type]}. Limits ${formatRange(z.min_temp_c, z.max_temp_c)}.`}
          </>
        }
        actions={hasSimulated ? <SimulatedBadge /> : undefined}
      />

      <div className="grid gap-6">
        <Panel>
          <PanelBody className="grid gap-6 py-6 lg:grid-cols-[280px_1fr]">
            <div className="grid content-start gap-3">
              <p className="type-small text-ink-muted">Now</p>
              <p className={cn("type-reading", state === "above" || state === "below" ? "text-critical" : "text-ink")}>
                {formatTemperature(latest?.temperature_c)}
              </p>
              {latest?.humidity_pct !== null && latest?.humidity_pct !== undefined ? (
                <p className="type-small tabular text-ink-muted">{formatHumidity(latest.humidity_pct)}</p>
              ) : null}
              <BandGauge value={latest?.temperature_c ?? null} min={z.min_temp_c} max={z.max_temp_c} />
              <p className="type-caption text-ink-subtle">
                {latest ? `Updated ${timeAgo(latest.recorded_at)}` : "No readings in the last 24 hours"}
              </p>
            </div>
            <ReadingChart
              points={valid.filter((r) => r.temperature_c !== null).map((r) => ({ t: r.recorded_at, v: r.temperature_c as number }))}
              min={z.min_temp_c}
              max={z.max_temp_c}
              timeZone={tz}
            />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Recent readings" description={`Times in ${tz}.`} />
          {recent.length ? (
            <Table caption="Recent readings">
              <THead>
                <tr>
                  <Th>Time</Th>
                  <Th className="text-right">Temperature</Th>
                  <Th className="text-right">Humidity</Th>
                  <Th>Source</Th>
                </tr>
              </THead>
              <TBody>
                {recent.map((r) => {
                  const out = excursionState(r.temperature_c, z.min_temp_c, z.max_temp_c);
                  return (
                    <Tr key={r.id}>
                      <Td className="tabular text-ink-muted">{formatDateTime(r.recorded_at, tz)}</Td>
                      <Td numeric className={out === "above" || out === "below" ? "font-medium text-critical" : undefined}>
                        {formatTemperature(r.temperature_c)}
                      </Td>
                      <Td numeric>{formatHumidity(r.humidity_pct)}</Td>
                      <Td>
                        {r.quality === "invalid" ? (
                          <Badge tone="warn">Invalid value</Badge>
                        ) : (
                          <Badge tone={r.source === "simulated" ? "warn" : "neutral"}>{SOURCE_LABEL[r.source]}</Badge>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          ) : (
            <p className="px-5 py-6 type-small text-ink-muted">No readings yet. Readings appear as soon as a sensor in this zone reports.</p>
          )}
        </Panel>

        {canRecord ? (
          <Panel>
            <PanelHeader title="Record a manual reading" description="For handheld thermometer checks. Marked as manual in reports." />
            <PanelBody>
              <ManualReadingForm zoneId={id} sensors={sensors ?? []} />
            </PanelBody>
          </Panel>
        ) : null}

        {canManage ? (
          <>
            <Panel>
              <PanelHeader title="Limits and settings" />
              <PanelBody>
                <ZoneForm
                  zoneId={id}
                  initial={{
                    name: z.name,
                    type: z.type,
                    minTemp: z.min_temp_c?.toString() ?? "",
                    maxTemp: z.max_temp_c?.toString() ?? "",
                    minHumidity: z.min_humidity_pct?.toString() ?? "",
                    maxHumidity: z.max_humidity_pct?.toString() ?? "",
                    interval: String(z.monitoring_interval_minutes),
                  }}
                />
              </PanelBody>
            </Panel>
            <ActionForm action={archiveZone} hidden={{ id }} confirm={`Archive ${z.name}? Its history stays in reports.`}>
              <SubmitButton variant="danger" size="sm" pendingLabel="Archiving">
                Archive zone
              </SubmitButton>
            </ActionForm>
          </>
        ) : null}
      </div>
    </>
  );
}
