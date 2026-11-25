import "server-only";

import { z } from "zod";
import type { AppContext } from "@/lib/auth/context";
import { formatDateTime } from "@/lib/format";
import { ALERT_TYPES } from "@/lib/labels";

export const REPORTS = {
  temperature_log: "Temperature log",
  compliance_summary: "Compliance summary",
  alert_history: "Alert history",
  incident_report: "Incident report",
  maintenance_log: "Maintenance log",
  audit_trail: "Audit trail",
} as const;
export type ReportType = keyof typeof REPORTS;

export const reportQuerySchema = z
  .object({
    type: z.enum(Object.keys(REPORTS) as [ReportType, ...ReportType[]]),
    warehouse: z.uuid(),
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine((q) => q.from <= q.to, { path: ["to"], message: "End date must be after the start date" })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 366, { path: ["to"], message: "Choose at most one year" });

export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type ReportTable = {
  title: string;
  warehouse: { id: string; name: string; timezone: string };
  columns: string[];
  rows: (string | number | null)[][];
  truncated: boolean;
  simulated: boolean;
};

const PAGE = 1000;
const MAX_ROWS = 50_000;

/** Fetches every page of a PostgREST query (the API returns at most 1000 rows per call). */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return { rows: out, truncated: false };
  }
  return { rows: out, truncated: true };
}

/** Start/end of the chosen days in UTC; days are inclusive. */
function range(q: ReportQuery) {
  return { start: `${q.from}T00:00:00Z`, end: new Date(Date.parse(`${q.to}T00:00:00Z`) + 86_400_000).toISOString() };
}

export async function buildReport(ctx: AppContext, q: ReportQuery): Promise<ReportTable> {
  const sb = ctx.supabase;
  const { data: warehouse } = await sb.from("warehouses").select("id, name, timezone").eq("id", q.warehouse).single();
  if (!warehouse) throw new Error("Warehouse not found");
  const tz = warehouse.timezone;
  const t = (iso: string | null) => (iso ? formatDateTime(iso, tz) : "");
  const { start, end } = range(q);

  const [{ data: zones }, { data: sensors }] = await Promise.all([
    sb.from("storage_zones").select("id, name, min_temp_c, max_temp_c, monitoring_interval_minutes").eq("warehouse_id", q.warehouse),
    sb.from("sensors").select("id, name").eq("warehouse_id", q.warehouse),
  ]);
  const zone = new Map((zones ?? []).map((z) => [z.id, z]));
  const sensorName = new Map((sensors ?? []).map((s) => [s.id, s.name]));
  const base = { title: REPORTS[q.type], warehouse, simulated: false };

  if (q.type === "temperature_log" || q.type === "compliance_summary") {
    const { rows, truncated } = await all((from, to) =>
      sb
        .from("sensor_readings")
        .select("recorded_at, zone_id, sensor_id, temperature_c, humidity_pct, source, quality")
        .eq("warehouse_id", q.warehouse)
        .gte("recorded_at", start)
        .lt("recorded_at", end)
        .order("recorded_at")
        .range(from, to),
    );
    const simulated = rows.some((r) => r.source === "simulated");

    if (q.type === "temperature_log") {
      return {
        ...base,
        simulated,
        truncated,
        columns: [`Time (${tz})`, "Zone", "Sensor", "Temperature °C", "Humidity %RH", "Within limits", "Source", "Quality"],
        rows: rows.map((r) => {
          const z = r.zone_id ? zone.get(r.zone_id) : undefined;
          const within =
            r.temperature_c === null || !z
              ? ""
              : (z.min_temp_c === null || r.temperature_c >= z.min_temp_c) && (z.max_temp_c === null || r.temperature_c <= z.max_temp_c)
                ? "Yes"
                : "No";
          return [t(r.recorded_at), z?.name ?? "", sensorName.get(r.sensor_id) ?? "", r.temperature_c, r.humidity_pct, within, r.source, r.quality];
        }),
      };
    }

    const { data: alerts } = await sb.from("alerts").select("zone_id").eq("warehouse_id", q.warehouse).gte("opened_at", start).lt("opened_at", end);
    const summary = (zones ?? []).map((z) => {
      const values = rows.filter((r) => r.zone_id === z.id && r.quality !== "invalid" && r.temperature_c !== null).map((r) => r.temperature_c as number);
      const outside = values.filter((v) => (z.min_temp_c !== null && v < z.min_temp_c) || (z.max_temp_c !== null && v > z.max_temp_c)).length;
      const avg = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null;
      return [
        z.name,
        [z.min_temp_c, z.max_temp_c].map((v) => (v === null ? "none" : `${v}`)).join(" to "),
        values.length,
        values.length ? Math.min(...values) : null,
        values.length ? Math.max(...values) : null,
        avg,
        outside,
        values.length ? `${Math.round(((values.length - outside) / values.length) * 1000) / 10}%` : "",
        (alerts ?? []).filter((a) => a.zone_id === z.id).length,
      ];
    });
    return {
      ...base,
      simulated,
      truncated,
      columns: ["Zone", "Limits °C", "Readings", "Min °C", "Max °C", "Average °C", "Readings outside limits", "Time within limits", "Alerts"],
      rows: summary,
    };
  }

  if (q.type === "alert_history") {
    const { rows, truncated } = await all((from, to) =>
      sb
        .from("alerts")
        .select("opened_at, zone_id, type, severity, status, title, observed_value, threshold_value, acknowledged_at, resolved_at, resolution_notes")
        .eq("warehouse_id", q.warehouse)
        .gte("opened_at", start)
        .lt("opened_at", end)
        .order("opened_at")
        .range(from, to),
    );
    return {
      ...base,
      truncated,
      simulated: rows.some((r) => r.title.startsWith("Simulated")),
      columns: [`Opened (${tz})`, "Zone", "Type", "Severity", "Status", "Observed", "Limit", "Acknowledged", "Resolved", "Resolution"],
      rows: rows.map((r) => [
        t(r.opened_at), r.zone_id ? (zone.get(r.zone_id)?.name ?? "") : "", ALERT_TYPES[r.type] ?? r.type, r.severity, r.status,
        r.observed_value, r.threshold_value, t(r.acknowledged_at), t(r.resolved_at), r.resolution_notes,
      ]),
    };
  }

  if (q.type === "incident_report") {
    const { rows, truncated } = await all((from, to) =>
      sb
        .from("incidents")
        .select("occurred_at, zone_id, title, severity, status, description, root_cause, corrective_action, resolution, resolved_at")
        .eq("warehouse_id", q.warehouse)
        .gte("occurred_at", start)
        .lt("occurred_at", end)
        .order("occurred_at")
        .range(from, to),
    );
    return {
      ...base,
      truncated,
      columns: [`Occurred (${tz})`, "Zone", "Incident", "Severity", "Status", "Description", "Root cause", "Corrective action", "Resolution", "Resolved"],
      rows: rows.map((r) => [
        t(r.occurred_at), r.zone_id ? (zone.get(r.zone_id)?.name ?? "") : "", r.title, r.severity, r.status,
        r.description, r.root_cause, r.corrective_action, r.resolution, t(r.resolved_at),
      ]),
    };
  }

  if (q.type === "maintenance_log") {
    const [{ data: equipment }, tasks, inspections] = await Promise.all([
      sb.from("equipment").select("id, name").eq("warehouse_id", q.warehouse),
      all((from, to) =>
        sb.from("maintenance_tasks").select("due_at, completed_at, title, status, notes, equipment_id").eq("warehouse_id", q.warehouse)
          .gte("due_at", start).lt("due_at", end).order("due_at").range(from, to),
      ),
      all((from, to) =>
        sb.from("inspections").select("inspected_at, result, findings, corrective_action, zone_id, equipment_id").eq("warehouse_id", q.warehouse)
          .gte("inspected_at", start).lt("inspected_at", end).order("inspected_at").range(from, to),
      ),
    ]);
    const eq = new Map((equipment ?? []).map((e) => [e.id, e.name]));
    return {
      ...base,
      truncated: tasks.truncated || inspections.truncated,
      columns: [`Date (${tz})`, "Kind", "Item", "Task or result", "Status", "Completed", "Notes"],
      rows: [
        ...tasks.rows.map((r) => [t(r.due_at), "Maintenance", eq.get(r.equipment_id) ?? "", r.title, r.status, t(r.completed_at), r.notes]),
        ...inspections.rows.map((r) => [
          t(r.inspected_at), "Inspection",
          (r.zone_id && zone.get(r.zone_id)?.name) || (r.equipment_id && eq.get(r.equipment_id)) || "",
          r.result, "", "", [r.findings, r.corrective_action].filter(Boolean).join(" / "),
        ]),
      ],
    };
  }

  // audit_trail: Owner/Admin only (RLS returns nothing to others)
  const { rows, truncated } = await all((from, to) =>
    sb
      .from("audit_logs")
      .select("created_at, actor_email, action, resource_type, resource_id, ip")
      .eq("company_id", ctx.company.companyId)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at")
      .range(from, to),
  );
  return {
    ...base,
    truncated,
    columns: [`Time (${tz})`, "User", "Action", "Record", "Record ID", "IP address"],
    rows: rows.map((r) => [t(r.created_at), r.actor_email ?? "system", r.action, r.resource_type, r.resource_id, r.ip as string | null]),
  };
}

/** Every export is recorded (who, what, when). */
export async function recordExport(ctx: AppContext, q: ReportQuery, format: "csv" | "pdf", rowCount: number, tz: string) {
  const { error } = await ctx.supabase.from("reports").insert({
    company_id: ctx.company.companyId,
    type: q.type,
    format,
    filters: { warehouse_id: q.warehouse },
    date_from: `${q.from}T00:00:00Z`,
    date_to: new Date(Date.parse(`${q.to}T00:00:00Z`) + 86_400_000).toISOString(),
    timezone: tz,
    row_count: rowCount,
  });
  if (error) console.error("report record failed", error.message);
}
