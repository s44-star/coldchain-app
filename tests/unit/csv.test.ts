import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

describe("csv", () => {
  it("quotes commas, quotes and new lines", () => {
    expect(csvCell('Door "A", north')).toBe('"Door ""A"", north"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralises spreadsheet formulas but keeps negative numbers", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-18.5")).toBe("-18.5");
    expect(csvCell(-18.5)).toBe("-18.5");
  });

  it("writes a BOM and CRLF rows", () => {
    expect(toCsv(["a", "b"], [[1, null]])).toBe("﻿a,b\r\n1,\r\n");
  });
});
