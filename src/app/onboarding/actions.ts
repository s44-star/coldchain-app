"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_COMPANY_COOKIE, requireUser } from "@/lib/auth/context";
import { companySchema, fieldErrors, formValues, type FormState } from "@/lib/validation";

export async function createCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireUser("/onboarding");
  const values = formValues(formData, ["name", "countryCode", "vatNumber", "registrationNumber"]);
  const parsed = companySchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const { data: companyId, error } = await supabase.rpc("create_company", {
    p_name: parsed.data.name,
    p_country_code: parsed.data.countryCode,
    p_vat_number: parsed.data.vatNumber ?? undefined,
    p_registration_number: parsed.data.registrationNumber ?? undefined,
  });

  if (error || !companyId) {
    if (error?.code === "54000") return { error: "You have created several companies today. Try again tomorrow.", values };
    console.error("create_company failed", error?.code, error?.message);
    return { error: "We could not create the company. Check the details and try again.", values };
  }

  (await cookies()).set(ACTIVE_COMPANY_COOKIE, companyId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/app");
}
