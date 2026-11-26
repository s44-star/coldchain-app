/**
 * Turns audit-log rows (written by database triggers) into plain sentences:
 * "Warehouse added: Rotterdam DC", "Zone changed: max temperature −18 → −20".
 */

export type AuditRow = {
  id: number;
  company_id: string | null;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: unknown;
  created_at: string;
};

const NOUNS: Record<string, string> = {
  companies: "Company",
  company_members: "Team member",
  company_invitations: "Invitation",
  platform_admins: "Super admin",
  warehouses: "Warehouse",
  warehouse_assignments: "Warehouse access",
  storage_zones: "Zone",
  equipment: "Equipment",
  sensors: "Sensor",
  sensor_api_keys: "Device key",
  alerts: "Alert",
  incidents: "Incident",
  maintenance_schedules: "Maintenance schedule",
  maintenance_tasks: "Maintenance task",
  inspections: "Inspection",
  subscription_plans: "Plan",
  customer_subscriptions: "Subscription",
  incident_attachments: "Incident file",
  payment_records: "Payment",
  refunds: "Refund",
  invoices: "Invoice",
  reports: "Report",
  app_settings: "Platform setting",
};

const VERBS: Record<string, string> = { created: "added", updated: "changed", deleted: "removed" };

/** Columns that are bookkeeping, not something a person changed. */
const QUIET = new Set(["id", "company_id", "created_at", "updated_at", "created_by", "updated_by", "last_seen_at", "last_used_at"]);

const NAME_FIELDS = ["name", "title", "email", "key", "label", "device_uid", "code", "role"];

export const ACTIVITY_TYPES = Object.entries(NOUNS)
  .filter(([key]) => !["platform_admins", "app_settings", "subscription_plans"].includes(key))
  .map(([value, label]) => ({ value, label }));

function humanize(field: string): string {
  return field
    .replace(/_c$/, " (°C)")
    .replace(/_pct$/, " (%)")
    .replace(/_id$/, "")
    .replace(/_/g, " ");
}

function short(value: unknown): string {
  if (value === null || value === undefined || value === "") return "empty";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

export function describeActivity(row: AuditRow): { what: string; details: string } {
  const [table = row.resource_type, op = ""] = row.action.split(".");
  const noun = NOUNS[table] ?? humanize(table).replace(/^\w/, (c) => c.toUpperCase());
  const verb = VERBS[op] ?? op;
  const meta = (row.metadata ?? {}) as { record?: Record<string, unknown>; changes?: Record<string, { from: unknown; to: unknown }> };

  const record = meta.record ?? {};
  const name = NAME_FIELDS.map((f) => record[f]).find((v) => typeof v === "string" && v.length > 0) as string | undefined;
  const what = `${noun} ${verb}${name ? `: ${short(name)}` : ""}`;

  const changes = Object.entries(meta.changes ?? {}).filter(([field]) => !QUIET.has(field));
  const details = changes
    .slice(0, 4)
    .map(([field, change]) => `${humanize(field)}: ${short(change.from)} → ${short(change.to)}`)
    .concat(changes.length > 4 ? [`and ${changes.length - 4} more`] : [])
    .join("; ");
  return { what, details };
}
