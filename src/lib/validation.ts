import { z } from "zod";

/** Shared input rules for forms and server actions. */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid e-mail address").max(254, "E-mail address is too long"));

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(72, "Use at most 72 characters");

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Enter your full name")
  .max(120, "Name is too long");

export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Choose a country");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .transform((v) => (v === "" ? null : v));

export const companySchema = z.object({
  name: z.string().trim().min(2, "Enter the company name").max(160, "Name is too long"),
  countryCode: countryCodeSchema,
  vatNumber: optionalText(32),
  registrationNumber: optionalText(64),
});

export const companyDetailsSchema = companySchema.extend({
  billingEmail: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.email("Enter a valid e-mail address").max(254).nullable()),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(120),
  postalCode: optionalText(20),
});

/** Result returned by form server actions and rendered by the form. */
export type FormState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Echo of submitted text fields so the form keeps them after an error. */
  values?: Record<string, string>;
  /** Extra payload, e.g. an invitation link to copy. */
  data?: Record<string, string>;
};

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

export function formValues(formData: FormData, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
}

/** Only same-site relative paths are allowed as post-login destinations. */
export function safeNext(next: unknown, fallback = "/app"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
