import { describe, expect, it } from "vitest";
import { excursionState, formatDateTime, formatHumidity, formatRange, formatTemperature } from "@/lib/format";
import { BAND, EXCURSION_PEAK_MINUTE, minutesAbove, peakOf, thermographTrace } from "@/lib/marketing/thermograph";
import { nextTheme, parseTheme } from "@/lib/theme";

describe("formatTemperature", () => {
  it("uses a true minus sign and a non-breaking space", () => {
    expect(formatTemperature(-21.43)).toBe("−21.4 °C");
    expect(formatTemperature(4)).toBe("4.0 °C");
  });

  it("shows a dash when there is no value", () => {
    expect(formatTemperature(null)).toBe("—");
    expect(formatTemperature(Number.NaN)).toBe("—");
  });
});

describe("formatHumidity / formatRange", () => {
  it("formats humidity", () => {
    expect(formatHumidity(61.6)).toBe("62 %RH");
  });

  it("describes partial limits in words", () => {
    expect(formatRange(2, 8)).toBe("2.0 °C to 8.0 °C");
    expect(formatRange(null, -18)).toBe("at most −18.0 °C");
    expect(formatRange(null, null)).toBe("No limits set");
  });
});

describe("formatDateTime", () => {
  it("renders in the warehouse time zone", () => {
    const value = formatDateTime("2026-11-24T13:35:00Z", "Europe/Amsterdam");
    expect(value).toContain("14:35");
    expect(value).toContain("24 Nov 2026");
  });
});

describe("excursionState", () => {
  it("classifies against the limits", () => {
    expect(excursionState(5, 2, 8)).toBe("within");
    expect(excursionState(8.1, 2, 8)).toBe("above");
    expect(excursionState(1.9, 2, 8)).toBe("below");
    expect(excursionState(null, 2, 8)).toBe("unknown");
    expect(excursionState(30, null, null)).toBe("within");
  });
});

describe("thermograph illustration", () => {
  const trace = thermographTrace();

  it("covers 24 hours at 5-minute intervals", () => {
    expect(trace).toHaveLength(289);
    expect(trace.at(-1)?.minute).toBe(1440);
  });

  it("has exactly one short excursion, at the annotated time", () => {
    const peak = peakOf(trace);
    expect(peak.minute).toBe(EXCURSION_PEAK_MINUTE);
    expect(peak.celsius).toBeGreaterThan(BAND.max);
    expect(minutesAbove(trace, BAND.max)).toBeLessThanOrEqual(15);
    expect(trace.every((p) => p.celsius > BAND.min)).toBe(true);
  });

  it("is deterministic", () => {
    expect(thermographTrace()).toEqual(trace);
  });
});

describe("theme", () => {
  it("defaults to light and cycles", () => {
    expect(parseTheme(undefined)).toBe("light");
    expect(parseTheme("neon")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
    expect(nextTheme("system")).toBe("light");
  });
});
