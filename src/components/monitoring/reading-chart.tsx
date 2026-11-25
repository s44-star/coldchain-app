import { formatTemperature } from "@/lib/format";

type Point = { t: string; v: number };

const W = 1000;
const nowMs = () => Date.now();
const H = 280;

/**
 * Temperature over time with the zone's tolerance band. Same visual language
 * as the landing-page thermograph: band shaded, values outside it in amber.
 * The SVG stretches; labels are HTML so text stays crisp.
 */
export function ReadingChart({
  points,
  min,
  max,
  timeZone,
  hours = 24,
}: {
  points: Point[];
  min: number | null;
  max: number | null;
  timeZone: string;
  hours?: number;
}) {
  if (points.length < 2) {
    return (
      <p className="grid h-40 place-items-center rounded-panel border border-dashed border-line-strong type-small text-ink-muted">
        Not enough readings in the last {hours} hours to draw a chart.
      </p>
    );
  }

  const end = nowMs();
  const start = end - hours * 3_600_000;
  const values = points.map((p) => p.v);
  const lo = Math.min(...values, min ?? Infinity) - 1;
  const hi = Math.max(...values, max ?? -Infinity) + 1;
  const x = (iso: string) => ((new Date(iso).getTime() - start) / (end - start)) * W;
  const y = (v: number) => ((hi - v) / (hi - lo)) * H;
  const pctY = (v: number) => `${((hi - v) / (hi - lo)) * 100}%`;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const label = (ms: number) =>
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);

  return (
    <figure className="grid gap-2" aria-label={`Temperature over the last ${hours} hours`}>
      <div className="relative h-56 sm:h-72">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden="true">
          <defs>
            {max !== null ? (
              <clipPath id="rc-above">
                <rect x="0" y="-10" width={W} height={y(max) + 10} />
              </clipPath>
            ) : null}
            {min !== null ? (
              <clipPath id="rc-below">
                <rect x="0" y={y(min)} width={W} height={H - y(min) + 10} />
              </clipPath>
            ) : null}
          </defs>
          {min !== null && max !== null ? (
            <rect x="0" y={y(max)} width={W} height={y(min) - y(max)} fill="var(--band)" />
          ) : null}
          {[min, max].map((limit, i) =>
            limit === null ? null : (
              <line key={i} x1="0" x2={W} y1={y(limit)} y2={y(limit)} stroke="var(--line-strong)" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
            ),
          )}
          <path d={d} fill="none" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {max !== null ? (
            <path d={d} fill="none" stroke="var(--critical)" strokeWidth="2.5" clipPath="url(#rc-above)" vectorEffect="non-scaling-stroke" />
          ) : null}
          {min !== null ? (
            <path d={d} fill="none" stroke="var(--critical)" strokeWidth="2.5" clipPath="url(#rc-below)" vectorEffect="non-scaling-stroke" />
          ) : null}
        </svg>
        {[max, min].map((limit, i) =>
          limit === null ? null : (
            <span
              key={i}
              className="absolute left-1 -translate-y-[calc(100%+2px)] type-caption tabular text-ink-subtle"
              style={{ top: pctY(limit) }}
            >
              {formatTemperature(limit, 0)}
            </span>
          ),
        )}
      </div>
      <div className="flex justify-between type-caption tabular text-ink-subtle" aria-hidden="true">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <span key={f}>{label(start + f * (end - start))}</span>
        ))}
      </div>
    </figure>
  );
}
