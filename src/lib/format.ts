/**
 * Formatting for sensor values and timestamps. Readings are stored in °C and
 * %RH, timestamps in UTC; display uses the warehouse's IANA time zone.
 */

const LOCALE = "en-GB";

export function formatTemperature(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const formatted = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
  // Use a true minus sign so negative freezer readings align and read clearly.
  return `${formatted.replace("-", "−")} °C`;
}

export function formatHumidity(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(value)} %RH`;
}

export function formatRange(min: number | null | undefined, max: number | null | undefined): string {
  const hasMin = min !== null && min !== undefined;
  const hasMax = max !== null && max !== undefined;
  if (hasMin && hasMax) return `${formatTemperature(min)} to ${formatTemperature(max)}`;
  if (hasMin) return `at least ${formatTemperature(min)}`;
  if (hasMax) return `at most ${formatTemperature(max)}`;
  return "No limits set";
}

/** Date and time in the given IANA zone, e.g. "24 Nov 2026, 14:32 CET". */
export function formatDateTime(iso: string | Date, timeZone = "UTC"): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(date);
}

export type ExcursionState = "within" | "above" | "below" | "unknown";

/** Where a value sits relative to a zone's limits. */
export function excursionState(
  value: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
): ExcursionState {
  if (value === null || value === undefined || Number.isNaN(value)) return "unknown";
  if (max !== null && max !== undefined && value > max) return "above";
  if (min !== null && min !== undefined && value < min) return "below";
  return "within";
}
