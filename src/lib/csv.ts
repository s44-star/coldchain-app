/**
 * CSV for spreadsheets. Text cells that start with = + - @ (or tab/CR) are
 * prefixed with an apostrophe so Excel never runs them as formulas; plain
 * numbers such as -18.5 are left as numbers.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns: string[], rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 (°C, accented names) correctly.
  return "﻿" + [columns, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
