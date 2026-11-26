import { describe, expect, it } from "vitest";
import { marketForCountry } from "@/lib/market";

describe("market", () => {
  it("puts India on rupee plans and everyone else on dollars", () => {
    expect(marketForCountry("IN")).toBe("in");
    expect(marketForCountry("NL")).toBe("global");
    expect(marketForCountry(undefined)).toBe("global");
  });
});
