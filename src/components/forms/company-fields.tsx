import { Field, Input, Select, describedBy } from "@/components/ui/form";
import { COUNTRIES } from "@/lib/countries";

type Values = Partial<Record<"name" | "countryCode" | "vatNumber" | "registrationNumber", string | null>>;

/** Company identity fields, shared by onboarding and company settings. */
export function CompanyIdentityFields({
  values,
  errors,
  disabled,
}: {
  values?: Values;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  return (
    <>
      <Field id="name" label="Company name" error={errors.name}>
        <Input
          id="name"
          name="name"
          autoComplete="organization"
          required
          disabled={disabled}
          defaultValue={values?.name ?? ""}
          aria-invalid={!!errors.name}
          aria-describedby={describedBy("name", null, errors.name)}
        />
      </Field>
      <Field id="countryCode" label="Country" error={errors.countryCode}>
        <Select
          id="countryCode"
          name="countryCode"
          required
          disabled={disabled}
          defaultValue={values?.countryCode ?? ""}
          aria-invalid={!!errors.countryCode}
          aria-describedby={describedBy("countryCode", null, errors.countryCode)}
        >
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
      <Field id="vatNumber" label="VAT number" hint="Optional. Printed on your invoices." error={errors.vatNumber}>
        <Input
          id="vatNumber"
          name="vatNumber"
          disabled={disabled}
          defaultValue={values?.vatNumber ?? ""}
          aria-invalid={!!errors.vatNumber}
          aria-describedby={describedBy("vatNumber", "hint", errors.vatNumber)}
        />
      </Field>
      <Field id="registrationNumber" label="Company registration number" hint="Optional." error={errors.registrationNumber}>
        <Input
          id="registrationNumber"
          name="registrationNumber"
          disabled={disabled}
          defaultValue={values?.registrationNumber ?? ""}
          aria-invalid={!!errors.registrationNumber}
          aria-describedby={describedBy("registrationNumber", "hint", errors.registrationNumber)}
        />
      </Field>
    </>
  );
}
