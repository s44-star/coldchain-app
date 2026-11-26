"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FormState } from "@/lib/validation";

export async function extendTrial(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requirePlatformAdmin();
  const id = String(formData.get("id"));
  const days = z.coerce.number().int().min(1).max(365).safeParse(formData.get("days"));
  if (!days.success) return { error: "Choose 1 to 365 days." };

  const { data: company } = await supabase.from("companies").select("trial_ends_at").eq("id", id).single();
  const base = Math.max(Date.now(), company?.trial_ends_at ? Date.parse(company.trial_ends_at) : 0);
  const { error } = await supabase
    .from("companies")
    .update({ status: "trial", trial_ends_at: new Date(base + days.data * 86_400_000).toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/companies/${id}`);
  return { ok: true, message: `Trial extended by ${days.data} days.` };
}

export async function setCompanyStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requirePlatformAdmin();
  const id = String(formData.get("id"));
  const status = z.enum(["trial", "active", "past_due", "suspended", "cancelled"]).safeParse(formData.get("status"));
  if (!status.success) return { error: "Choose a status." };
  const { error } = await supabase.from("companies").update({ status: status.data }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/companies/${id}`);
  return { ok: true, message: "Status saved." };
}

export async function setDemo(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requirePlatformAdmin();
  const id = String(formData.get("id"));
  const { error } = await supabase.from("companies").update({ is_demo: formData.get("demo") === "true" }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/companies/${id}`);
  return { ok: true, message: "Saved." };
}

const dollars = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Math.round(Number(v.replace(/[$₹,\s]/g, "")) * 100)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 0), "Enter an amount, for example 149 or 4999");
const limit = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v > 0), "Whole number, or empty for unlimited");

const planSchema = z.object({
  monthly: dollars,
  annual: dollars,
  setup: dollars,
  maxWarehouses: limit,
  maxZones: limit,
  maxSensors: limit,
  maxUsers: limit,
  isActive: z.enum(["true", "false"]),
});

export async function updatePlan(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requirePlatformAdmin();
  const id = String(formData.get("id"));
  const raw = Object.fromEntries(
    ["monthly", "annual", "setup", "maxWarehouses", "maxZones", "maxSensors", "maxUsers", "isActive"].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the values." };
  const d = parsed.data;

  const { error } = await supabase
    .from("subscription_plans")
    .update({
      monthly_price_cents: d.monthly,
      annual_price_cents: d.annual,
      setup_fee_cents: d.setup ?? 0,
      max_warehouses: d.maxWarehouses,
      max_zones: d.maxZones,
      max_sensors: d.maxSensors,
      max_users: d.maxUsers,
      is_active: d.isActive === "true",
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/plans");
  return { ok: true, message: "Plan saved. New checkouts use these prices." };
}

/**
 * Permanently deletes a company and everything in it (warehouses, readings,
 * incidents, files). Refused for companies with captured payments, whose
 * invoices must be kept. Optionally deletes member accounts that belong to
 * no other company.
 */
export async function deleteCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, userId } = await requirePlatformAdmin();
  const id = String(formData.get("id"));
  const { data: company } = await supabase.from("companies").select("id, name").eq("id", id).maybeSingle();
  if (!company) return { error: "Company not found." };
  if (String(formData.get("confirm") ?? "").trim() !== company.name) {
    return { error: "Type the company name exactly to confirm." };
  }

  const { count: paid } = await supabase
    .from("payment_records")
    .select("id", { count: "exact", head: true })
    .eq("company_id", id)
    .eq("status", "captured");
  if (paid) return { error: "This company has paid invoices, which must be kept. Suspend or cancel it instead." };

  const { data: members } = await supabase.from("company_members").select("user_id").eq("company_id", id);
  const admin = createAdminClient();

  // Evidence files live outside the database: remove them first.
  const bucket = admin.storage.from("incident-attachments");
  const { data: folders } = await bucket.list(id, { limit: 1000 });
  for (const folder of folders ?? []) {
    const { data: files } = await bucket.list(`${id}/${folder.name}`, { limit: 1000 });
    if (files?.length) await bucket.remove(files.map((f) => `${id}/${folder.name}/${f.name}`));
  }

  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) return { error: error.message };

  let removedUsers = 0;
  if (formData.get("deleteUsers") === "on") {
    const { data: platformAdmins } = await admin.from("platform_admins").select("user_id");
    const protectedIds = new Set([userId, ...(platformAdmins ?? []).map((p) => p.user_id)]);
    for (const { user_id } of members ?? []) {
      if (protectedIds.has(user_id)) continue;
      const { count } = await admin.from("company_members").select("id", { count: "exact", head: true }).eq("user_id", user_id);
      if (count) continue; // still in another company
      const { error: userError } = await admin.auth.admin.deleteUser(user_id);
      if (!userError) removedUsers += 1;
    }
  }

  revalidatePath("/admin");
  redirect(`/admin?deleted=${encodeURIComponent(company.name)}&users=${removedUsers}`);
}

/** Editable platform settings and their allowed ranges. Secrets are never editable here. */
const EDITABLE_SETTINGS = {
  trial_days: { min: 1, max: 90 },
  reading_retention_months: { min: 3, max: 120 },
} as const;

export async function saveSetting(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requirePlatformAdmin();
  const key = String(formData.get("key")) as keyof typeof EDITABLE_SETTINGS;
  const rule = EDITABLE_SETTINGS[key];
  if (!rule) return { error: "This setting cannot be changed here." };
  const value = z.coerce.number().int().min(rule.min).max(rule.max).safeParse(formData.get("value"));
  if (!value.success) return { error: `Enter a whole number from ${rule.min} to ${rule.max}.` };
  // Through the signed-in client, so the audit log records who changed it.
  const { error } = await supabase.from("app_settings").update({ value: value.data }).eq("key", key);
  if (error) return { error: "Could not save the setting." };
  revalidatePath("/admin/settings");
  return { ok: true, message: "Saved." };
}

const sellerSchema = z.object({
  key: z.enum(["seller_in", "seller_global"]),
  name: z.string().trim().min(2, "Enter the business name").max(120),
  address: z.string().trim().max(400),
  email: z.string().trim().email("Enter a valid e-mail"),
  taxNote: z.string().trim().max(200),
});

/** Seller details printed on new invoices; issued invoices keep their copy. */
export async function saveSeller(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requirePlatformAdmin();
  const parsed = sellerSchema.safeParse(Object.fromEntries(["key", "name", "address", "email", "taxNote"].map((k) => [k, String(formData.get(k) ?? "")])));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const d = parsed.data;
  const { error } = await supabase
    .from("app_settings")
    .update({ value: { name: d.name, address: d.address, email: d.email, tax_note: d.taxNote } })
    .eq("key", d.key);
  if (error) return { error: "Could not save the details." };
  revalidatePath("/admin/settings");
  return { ok: true, message: "Saved. New invoices use these details." };
}
