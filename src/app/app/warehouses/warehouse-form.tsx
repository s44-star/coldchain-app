"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { Field, Input, Select, describedBy } from "@/components/ui/form";
import { COUNTRIES } from "@/lib/countries";
import { WAREHOUSE_TYPES } from "@/lib/labels";
import type { FormState } from "@/lib/validation";
import { createWarehouse, updateWarehouse } from "./actions";


const TIMEZONES = [
  "Europe/Amsterdam", "Europe/Athens", "Europe/Berlin", "Europe/Brussels", "Europe/Bucharest", "Europe/Budapest",
  "Europe/Copenhagen", "Europe/Dublin", "Europe/Helsinki", "Europe/Lisbon", "Europe/London", "Europe/Madrid",
  "Europe/Oslo", "Europe/Paris", "Europe/Prague", "Europe/Riga", "Europe/Rome", "Europe/Sofia", "Europe/Stockholm",
  "Europe/Tallinn", "Europe/Vienna", "Europe/Vilnius", "Europe/Warsaw", "Europe/Zurich", "Europe/Istanbul",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Amman", "Asia/Riyadh", "Africa/Nairobi", "Africa/Lagos", "Africa/Kigali",
  "America/New_York", "America/Chicago", "America/Los_Angeles", "UTC",
];

export type WarehouseValues = Record<
  "name" | "code" | "type" | "countryCode" | "city" | "addressLine1" | "timezone" | "contactName" | "contactPhone",
  string
>;

const EMPTY: WarehouseValues = {
  name: "", code: "", type: "cold_storage", countryCode: "", city: "", addressLine1: "",
  timezone: "Europe/Amsterdam", contactName: "", contactPhone: "",
};

export function WarehouseForm({ id, initial, defaultCountry }: { id?: string; initial?: WarehouseValues; defaultCountry?: string }) {
  const [state, action] = useActionState(id ? updateWarehouse : createWarehouse, {} as FormState);
  const v = { ...EMPTY, countryCode: defaultCountry ?? "", ...initial, ...state.values };
  const e = state.fieldErrors ?? {};
  const text = (name: keyof WarehouseValues, label: string, hint?: string, autoComplete?: string) => (
    <Field id={`wh-${name}`} label={label} hint={hint} error={e[name]}>
      <Input
        id={`wh-${name}`}
        name={name}
        autoComplete={autoComplete}
        defaultValue={v[name]}
        aria-invalid={!!e[name]}
        aria-describedby={describedBy(`wh-${name}`, hint, e[name])}
      />
    </Field>
  );

  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="grid gap-5 md:grid-cols-2">
        {text("name", "Name")}
        {text("code", "Short code", "Optional, e.g. RTM1. Shown in reports.")}
        <Field id="wh-type" label="Type">
          <Select id="wh-type" name="type" defaultValue={v.type}>
            {Object.entries(WAREHOUSE_TYPES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="wh-timezone" label="Time zone" hint="Reports and charts use this local time." error={e.timezone}>
          <Select id="wh-timezone" name="timezone" defaultValue={v.timezone} aria-describedby={describedBy("wh-timezone", "hint", e.timezone)}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace("_", " ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="wh-countryCode" label="Country" error={e.countryCode}>
          <Select id="wh-countryCode" name="countryCode" defaultValue={v.countryCode} aria-invalid={!!e.countryCode}>
            <option value="" disabled>
              Choose a country
            </option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {text("city", "City", undefined, "address-level2")}
        {text("addressLine1", "Address", undefined, "address-line1")}
        {text("contactName", "Site contact")}
        {text("contactPhone", "Site contact phone", undefined, "tel")}
      </div>
      <div>
        <SubmitButton pendingLabel="Saving">{id ? "Save warehouse" : "Add warehouse"}</SubmitButton>
      </div>
    </form>
  );
}
