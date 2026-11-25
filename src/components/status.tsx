import type { Enums } from "@/types/database";
import { Badge, type Tone } from "@/components/ui/badge";

/** One place that maps database states to colours and words. */

const severity: Record<Enums<"alert_severity">, { tone: Tone; label: string }> = {
  info: { tone: "info", label: "Info" },
  warning: { tone: "warn", label: "Warning" },
  critical: { tone: "critical", label: "Critical" },
};

const alertStatus: Record<Enums<"alert_status">, { tone: Tone; label: string }> = {
  open: { tone: "critical", label: "Open" },
  acknowledged: { tone: "warn", label: "Acknowledged" },
  resolved: { tone: "ok", label: "Resolved" },
};

const sensorStatus: Record<Enums<"sensor_status">, { tone: Tone; label: string }> = {
  registered: { tone: "neutral", label: "Registered" },
  active: { tone: "ok", label: "Reporting" },
  offline: { tone: "critical", label: "Offline" },
  retired: { tone: "neutral", label: "Retired" },
};

const incidentStatus: Record<Enums<"incident_status">, { tone: Tone; label: string }> = {
  open: { tone: "critical", label: "Open" },
  under_investigation: { tone: "warn", label: "Under investigation" },
  action_required: { tone: "warn", label: "Action required" },
  resolved: { tone: "ok", label: "Resolved" },
  closed: { tone: "neutral", label: "Closed" },
};

const deliveryStatus: Record<Enums<"delivery_status">, { tone: Tone; label: string }> = {
  pending: { tone: "info", label: "Queued" },
  sent: { tone: "ok", label: "Sent" },
  failed: { tone: "critical", label: "Failed" },
  provider_not_configured: { tone: "neutral", label: "Not sent: no provider configured" },
};

export const roleLabels: Record<Enums<"member_role">, string> = {
  owner: "Owner",
  admin: "Admin",
  warehouse_manager: "Warehouse manager",
  operator: "Operator",
  viewer: "Viewer",
};

export function SeverityBadge({ value }: { value: Enums<"alert_severity"> }) {
  const s = severity[value];
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export function AlertStatusBadge({ value }: { value: Enums<"alert_status"> }) {
  const s = alertStatus[value];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function SensorStatusBadge({ value }: { value: Enums<"sensor_status"> }) {
  const s = sensorStatus[value];
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export function IncidentStatusBadge({ value }: { value: Enums<"incident_status"> }) {
  const s = incidentStatus[value];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function DeliveryStatusBadge({ value }: { value: Enums<"delivery_status"> }) {
  const s = deliveryStatus[value];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
