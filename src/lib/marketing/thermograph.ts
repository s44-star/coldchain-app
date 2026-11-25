/**
 * Data for the landing-page illustration: 24 hours of a 2–8 °C pharmaceutical
 * store logged every 5 minutes, with compressor cycling, three defrost
 * cycles and one door-open excursion. Deterministic, so server and client
 * render the same picture. It is an illustration, never shown as real data.
 */

export type TracePoint = { minute: number; celsius: number };

export const BAND = { min: 2, max: 8 } as const;
export const EXCURSION_PEAK_MINUTE = 14 * 60 + 35; // 14:35

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Smooth bump centred on `at` (minutes) with the given width and height. */
function bump(minute: number, at: number, width: number, height: number): number {
  const d = (minute - at) / width;
  return height * Math.exp(-d * d);
}

export function thermographTrace(stepMinutes = 5): TracePoint[] {
  const random = seeded(20261124);
  const points: TracePoint[] = [];

  for (let minute = 0; minute <= 24 * 60; minute += stepMinutes) {
    const compressor = 0.32 * Math.sin((minute / 38) * Math.PI * 2);
    const drift = 0.25 * Math.sin((minute / 1440) * Math.PI * 2 - 1.2);
    const defrost =
      bump(minute, 2 * 60 + 10, 9, 1.05) + bump(minute, 8 * 60 + 10, 9, 1.1) + bump(minute, 20 * 60 + 10, 9, 1.0);
    // Door left open: fast rise to the 14:35 peak, slower recovery.
    const door =
      minute <= EXCURSION_PEAK_MINUTE
        ? bump(minute, EXCURSION_PEAK_MINUTE, 9, 3.8)
        : bump(minute, EXCURSION_PEAK_MINUTE, 16, 3.8);
    const noise = (random() - 0.5) * 0.16;

    points.push({ minute, celsius: round(4.9 + compressor + drift + defrost + door + noise) });
  }

  return points;
}

export function peakOf(points: TracePoint[]): TracePoint {
  return points.reduce((max, p) => (p.celsius > max.celsius ? p : max), points[0] ?? { minute: 0, celsius: 0 });
}

/** Minutes the trace spends above the band's upper limit (step-weighted). */
export function minutesAbove(points: TracePoint[], limit: number, stepMinutes = 5): number {
  return points.filter((p) => p.celsius > limit).length * stepMinutes;
}

export function clockLabel(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
