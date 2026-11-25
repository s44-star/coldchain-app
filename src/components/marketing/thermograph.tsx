import { BAND, clockLabel, peakOf, thermographTrace } from "@/lib/marketing/thermograph";
import { formatTemperature } from "@/lib/format";

const W = 1200;
const H = 340;
const Y_MIN = 0;
const Y_MAX = 11;
const DAY = 24 * 60;

const x = (minute: number) => (minute / DAY) * W;
const y = (celsius: number) => ((Y_MAX - celsius) / (Y_MAX - Y_MIN)) * H;
const pctX = (minute: number) => `${(minute / DAY) * 100}%`;
const pctY = (celsius: number) => `${((Y_MAX - celsius) / (Y_MAX - Y_MIN)) * 100}%`;

/**
 * The hero illustration: a day of readings inside a 2–8 °C band with one
 * excursion. The SVG stretches to its box (non-scaling strokes); every label
 * is HTML so text stays crisp at any width.
 */
export function Thermograph() {
  const points = thermographTrace();
  const peak = peakOf(points);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.minute).toFixed(1)},${y(p.celsius).toFixed(1)}`).join("");

  return (
    <figure className="relative" aria-labelledby="thermograph-caption">
      <div className="relative h-[240px] sm:h-[300px] lg:h-[340px]">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <clipPath id="tg-reveal">
              <rect className="trace-wipe" x="0" y="-20" width={W} height={H + 40} />
            </clipPath>
            <clipPath id="tg-above">
              <rect x="0" y="-20" width={W} height={y(BAND.max) + 20} />
            </clipPath>
            <clipPath id="tg-within">
              <rect x="0" y={y(BAND.max)} width={W} height={H - y(BAND.max) + 20} />
            </clipPath>
          </defs>

          <rect x="0" y={y(BAND.max)} width={W} height={y(BAND.min) - y(BAND.max)} fill="var(--band)" />
          {[BAND.max, BAND.min].map((limit) => (
            <line
              key={limit}
              x1="0"
              x2={W}
              y1={y(limit)}
              y2={y(limit)}
              stroke="var(--line-strong)"
              strokeDasharray="4 6"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {[6, 12, 18].map((hour) => (
            <line
              key={hour}
              x1={x(hour * 60)}
              x2={x(hour * 60)}
              y1="0"
              y2={H}
              stroke="var(--line)"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <g clipPath="url(#tg-reveal)" fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
            <path d={d} stroke="var(--primary)" clipPath="url(#tg-within)" vectorEffect="non-scaling-stroke" />
            <path d={d} stroke="var(--warn)" clipPath="url(#tg-above)" vectorEffect="non-scaling-stroke" />
          </g>
        </svg>

        {/* Band limits */}
        {[BAND.max, BAND.min].map((limit) => (
          <span
            key={limit}
            className="absolute left-0 -translate-y-[calc(100%+4px)] type-caption tabular text-ink-subtle"
            style={{ top: pctY(limit) }}
          >
            {formatTemperature(limit, 0)}
          </span>
        ))}

        {/* Excursion marker and note */}
        <span
          aria-hidden="true"
          className="trace-note absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-warn bg-canvas"
          style={{ left: pctX(peak.minute), top: pctY(peak.celsius) }}
        />
        <div
          className="trace-note absolute hidden w-64 -translate-y-1/2 border-l-2 border-warn pl-3 md:block"
          style={{ left: `calc(${pctX(peak.minute)} + 20px)`, top: pctY(peak.celsius + 0.4) }}
        >
          <p className="type-small font-semibold tabular text-ink">
            {formatTemperature(peak.celsius)} at {clockLabel(peak.minute)}
          </p>
          <p className="type-small text-ink-muted">
            Loading door left open. Acknowledged in 2 minutes, back within limits at 14:45.
          </p>
        </div>
      </div>

      {/* Time axis */}
      <div className="relative mt-2 h-4 type-caption tabular text-ink-subtle" aria-hidden="true">
        {[0, 6, 12, 18, 24].map((hour) => (
          <span
            key={hour}
            className={hour === 0 ? "absolute left-0" : hour === 24 ? "absolute right-0" : "absolute -translate-x-1/2"}
            style={hour === 0 || hour === 24 ? undefined : { left: pctX(hour * 60) }}
          >
            {clockLabel(hour * 60)}
          </span>
        ))}
      </div>

      <figcaption id="thermograph-caption" className="mt-4 grid gap-1 type-small text-ink-muted md:block">
        <span className="md:hidden">
          <strong className="font-semibold text-ink">
            {formatTemperature(peak.celsius)} at {clockLabel(peak.minute)}.
          </strong>{" "}
          Loading door left open. Acknowledged in 2 minutes, back within limits at 14:45.{" "}
        </span>
        Illustration: a pharmaceutical store held at 2–8 °C, logged every 5 minutes for 24 hours.
      </figcaption>
    </figure>
  );
}
