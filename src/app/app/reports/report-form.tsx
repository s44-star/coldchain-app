"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";

export function ReportForm({
  warehouses,
  types,
  from: initialFrom,
  to: initialTo,
}: {
  warehouses: { id: string; name: string }[];
  types: { value: string; label: string }[];
  from: string;
  to: string;
}) {
  const [type, setType] = useState(types[0]?.value ?? "temperature_log");
  const [warehouse, setWarehouse] = useState(warehouses[0]?.id ?? "");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const invalid = !from || !to || from > to;
  const query = new URLSearchParams({ type, warehouse, from, to }).toString();

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="r-type" label="Report">
          <Select id="r-type" value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="r-wh" label="Warehouse">
          <Select id="r-wh" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="r-from" label="From">
          <Input id="r-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field id="r-to" label="To" error={invalid ? "Choose an end date on or after the start date" : null}>
          <Input id="r-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-invalid={invalid} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-3">
        <a
          href={invalid ? undefined : `/app/reports/view?${query}`}
          aria-disabled={invalid}
          className={buttonClasses({ className: invalid ? "pointer-events-none opacity-50" : undefined })}
        >
          View and save as PDF
        </a>
        <a
          href={invalid ? undefined : `/app/reports/export?${query}`}
          aria-disabled={invalid}
          className={buttonClasses({ variant: "secondary", className: invalid ? "pointer-events-none opacity-50" : undefined })}
        >
          Download CSV
        </a>
      </div>
    </div>
  );
}
