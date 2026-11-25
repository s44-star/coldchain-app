"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/admin";
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
  .transform((v) => (v === "" ? null : Math.round(Number(v.replace(/[$,]/g, "")) * 100)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 0), "Enter an amount in dollars");
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
