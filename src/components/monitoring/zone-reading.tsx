import { cn } from "@/lib/utils";
import { excursionState, formatHumidity, formatTemperature, type ExcursionState } from "@/lib/format";

type ZoneReadingProps = {
  zoneName: string;
  location: string;
  temperatureC: number | null;
  humidityPct?: number | null;
  minC: number | null;
  maxC: number | null;
  /** e.g. "2 min ago" — formatted by the caller in the warehouse time zone */
  updatedLabel: string;
  className?: string;
};

const stateText: Record<ExcursionState, { label: string; className: string }> = {
  within: { label: "Within limits", className: "text-ok" },
  above: { label: "Above limit", className: "text-critical" },
  below: { label: "Below limit", className: "text-critical" },
  unknown: { label: "No reading", className: "text-ink-muted" },
};

/**
 * Current reading for one zone, with its tolerance band drawn underneath —
 * the same band-and-marker language as the marketing thermograph.
 */
export function ZoneReading({
  zoneName,
  location,
  temperatureC,
  humidityPct,
  minC,
  maxC,
  updatedLabel,
  className,
}: ZoneReadingProps) {
  const state = excursionState(temperatureC, minC, maxC);
  const s = stateText[state];

  return (
    <article className={cn("grid gap-4 rounded-panel border border-line bg-surface p-5", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h3 className="type-h3 text-ink">{zoneName}</h3>
          <p className="type-small text-ink-muted">{location}</p>
        </div>
        <p className={cn("type-small font-medium", s.className)}>{s.label}</p>
      </header>

      <div className="flex items-end justify-between gap-3">
        <p className={cn("type-reading", state === "above" || state === "below" ? "text-critical" : "text-ink")}>
          {formatTemperature(temperatureC)}
        </p>
        {humidityPct !== undefined ? (
          <p className="type-small tabular text-ink-muted">{formatHumidity(humidityPct)}</p>
        ) : null}
      </div>

      <BandGauge value={temperatureC} min={minC} max={maxC} />

      <p className="type-caption text-ink-subtle">Updated {updatedLabel}</p>
    </article>
  );
}

/** Horizontal gauge: shaded tolerance band, tick for the current value. */
export function BandGauge({ value, min, max }: { value: number | null; min: number | null; max: number | null }) {
  if (min === null || max === null) {
    return <p className="type-caption text-ink-muted">Set limits for this zone to see the band.</p>;
  }

  const span = max - min;
  const lo = min - span * 0.6;
  const hi = max + span * 0.6;
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  const outside = value !== null && (value < min || value > max);

  return (
    <div className="grid gap-1.5">
      <div
        className="relative h-2 rounded-full bg-surface-2"
        role="img"
        aria-label={`Limits ${formatTemperature(min)} to ${formatTemperature(max)}${
          value !== null ? `, current ${formatTemperature(value)}` : ""
        }`}
      >
        <div
          className="absolute inset-y-0 rounded-full bg-primary-soft ring-1 ring-primary/30"
          style={{ left: `${pct(min)}%`, width: `${pct(max) - pct(min)}%` }}
        />
        {value !== null ? (
          <div
            className={cn(
              "absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full",
              outside ? "bg-critical" : "bg-primary",
            )}
            style={{ left: `${pct(value)}%` }}
          />
        ) : null}
      </div>
      <div className="relative h-4 type-caption tabular text-ink-subtle" aria-hidden="true">
        <span className="absolute -translate-x-1/2" style={{ left: `${pct(min)}%` }}>
          {formatTemperature(min, 0)}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: `${pct(max)}%` }}>
          {formatTemperature(max, 0)}
        </span>
      </div>
    </div>
  );
}
