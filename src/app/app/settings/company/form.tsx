"use client";

import { useActionState } from "react";
import { CompanyIdentityFields } from "@/components/forms/company-fields";
import { FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { Field, Input, describedBy } from "@/components/ui/form";
import type { FormState } from "@/lib/validation";
import { updateCompany } from "./actions";

export type CompanyValues = Record<
  | "name"
  | "countryCode"
  | "vatNumber"
  | "registrationNumber"
  | "billingEmail"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "postalCode",
  string
>;

const EXTRA: { key: keyof CompanyValues; label: string; autoComplete?: string; type?: string; hint?: string }[] = [
  { key: "billingEmail", label: "Billing e-mail", type: "email", hint: "Invoices and payment notices go here." },
  { key: "addressLine1", label: "Address", autoComplete: "address-line1" },
  { key: "addressLine2", label: "Address line 2", autoComplete: "address-line2" },
  { key: "city", label: "City", autoComplete: "address-level2" },
  { key: "postalCode", label: "Postal code", autoComplete: "postal-code" },
];

export function CompanyForm({ initial, readOnly }: { initial: CompanyValues; readOnly: boolean }) {
  const [state, action] = useActionState(updateCompany, {} as FormState);
  const values = { ...initial, ...state.values };
  const e = state.fieldErrors ?? {};

  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-5 md:grid-cols-2">
        <CompanyIdentityFields values={values} errors={e} disabled={readOnly} />
        {EXTRA.map((f) => (
          <Field key={f.key} id={f.key} label={f.label} hint={f.hint} error={e[f.key]}>
            <Input
              id={f.key}
              name={f.key}
              type={f.type ?? "text"}
              autoComplete={f.autoComplete}
              disabled={readOnly}
              defaultValue={values[f.key]}
              aria-invalid={!!e[f.key]}
              aria-describedby={describedBy(f.key, f.hint, e[f.key])}
            />
          </Field>
        ))}
      </div>
      {readOnly ? (
        <p className="type-small text-ink-muted">Only the owner or an admin can change these details.</p>
      ) : (
        <div>
          <SubmitButton pendingLabel="Saving">Save company details</SubmitButton>
        </div>
      )}
    </form>
  );
}
