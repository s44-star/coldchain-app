"use server";

import { revalidatePath } from "next/cache";
import { getAppContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/roles";
import { companyDetailsSchema, fieldErrors, formValues, type FormState } from "@/lib/validation";

const FIELDS = [
  "name",
  "countryCode",
  "vatNumber",
  "registrationNumber",
  "billingEmail",
  "addressLine1",
  "addressLine2",
  "city",
  "postalCode",
];

export async function updateCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  if (!can.editCompany(ctx.role)) return { error: "Only the owner or an admin can edit company details." };

  const values = formValues(formData, FIELDS);
  const parsed = companyDetailsSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const d = parsed.data;

  const { error } = await ctx.supabase
    .from("companies")
    .update({
      name: d.name,
      country_code: d.countryCode,
      vat_number: d.vatNumber,
      registration_number: d.registrationNumber,
      billing_email: d.billingEmail,
      address_line1: d.addressLine1,
      address_line2: d.addressLine2,
      city: d.city,
      postal_code: d.postalCode,
    })
    .eq("id", ctx.company.companyId);

  if (error) {
    console.error("company update failed", error.code, error.message);
    return { error: "Could not save company details. Try again.", values };
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: "Company details saved.", values };
}
