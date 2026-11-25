"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAppContext } from "@/lib/auth/context";
import { countryCodeSchema, fieldErrors, formValues, type FormState } from "@/lib/validation";

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .transform((v) => (v === "" ? null : v));

const timezone = z
  .string()
  .trim()
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid time zone");

const warehouseSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([A-Z0-9][A-Z0-9_-]{0,15})?$/, "Use up to 16 letters, digits, - or _")
    .transform((v) => (v === "" ? null : v)),
  type: z.enum(["cold_storage", "distribution_center", "pharmaceutical", "food_processing", "port_terminal", "other"]),
  countryCode: countryCodeSchema,
  city: optional(120),
  addressLine1: optional(200),
  timezone,
  contactName: optional(120),
  contactPhone: optional(32),
});

const FIELDS = ["name", "code", "type", "countryCode", "city", "addressLine1", "timezone", "contactName", "contactPhone"];

function toRow(d: z.infer<typeof warehouseSchema>) {
  return {
    name: d.name,
    code: d.code,
    type: d.type,
    country_code: d.countryCode,
    city: d.city,
    address_line1: d.addressLine1,
    timezone: d.timezone,
    contact_name: d.contactName,
    contact_phone: d.contactPhone,
  };
}

function friendly(code: string | undefined, fallback: string, message?: string): string {
  if (code === "53400" && message) return message;
  if (code === "23505") return "A warehouse with this name or code already exists.";
  if (code === "42501") return "You do not have permission to do this.";
  return fallback;
}

export async function createWarehouse(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const values = formValues(formData, FIELDS);
  const parsed = warehouseSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const { data, error } = await ctx.supabase
    .from("warehouses")
    .insert({ ...toRow(parsed.data), company_id: ctx.company.companyId })
    .select("id")
    .single();
  if (error || !data) return { error: friendly(error?.code, "Could not add the warehouse.", error?.message), values };

  revalidatePath("/app", "layout");
  redirect(`/app/warehouses/${data.id}`);
}

export async function updateWarehouse(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const id = String(formData.get("id"));
  const values = formValues(formData, FIELDS);
  const parsed = warehouseSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const { data, error } = await ctx.supabase.from("warehouses").update(toRow(parsed.data)).eq("id", id).select("id");
  if (error || !data?.length) return { error: friendly(error?.code, "Could not save. Only the owner or an admin can edit warehouses."), values };
  revalidatePath(`/app/warehouses/${id}`);
  return { ok: true, message: "Warehouse saved.", values };
}

export async function archiveWarehouse(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const id = String(formData.get("id"));
  const { data, error } = await ctx.supabase
    .from("warehouses")
    .update({ archived_at: new Date().toISOString(), operational_status: "offline" })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { error: "Only the owner or an admin can archive warehouses." };
  revalidatePath("/app", "layout");
  redirect("/app/warehouses");
}

export async function assignManager(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const warehouseId = String(formData.get("warehouseId"));
  const { error } = await ctx.supabase.from("warehouse_assignments").insert({
    company_id: ctx.company.companyId,
    warehouse_id: warehouseId,
    user_id: String(formData.get("userId")),
  });
  if (error) return { error: error.code === "23505" ? "Already assigned." : "Could not assign this manager." };
  revalidatePath(`/app/warehouses/${warehouseId}`);
  return { ok: true };
}

export async function unassignManager(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const warehouseId = String(formData.get("warehouseId"));
  const { data, error } = await ctx.supabase
    .from("warehouse_assignments")
    .delete()
    .eq("id", String(formData.get("id")))
    .select("id");
  if (error || !data?.length) return { error: "Could not remove this assignment." };
  revalidatePath(`/app/warehouses/${warehouseId}`);
  return { ok: true };
}
