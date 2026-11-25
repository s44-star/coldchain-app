"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAppContext } from "@/lib/auth/context";
import { fieldErrors, formValues, type FormState } from "@/lib/validation";

const PATH = "/app/maintenance";
const NO_MANAGE = "Only the owner, an admin, or a manager of this warehouse can do this.";
const optionalUuid = z.union([z.uuid(), z.literal("")]).transform((v) => (v === "" ? null : v));

const equipmentSchema = z.object({
  warehouseId: z.uuid("Choose a warehouse"),
  zoneId: optionalUuid,
  name: z.string().trim().min(1, "Enter a name").max(120),
  category: z.string().trim().min(1, "Choose a type").max(60),
  manufacturer: z.string().trim().max(120).transform((v) => v || null),
  serialNumber: z.string().trim().max(120).transform((v) => v || null),
});

export async function addEquipment(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const values = formValues(formData, ["warehouseId", "zoneId", "name", "category", "manufacturer", "serialNumber"]);
  const parsed = equipmentSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const d = parsed.data;
  const { error } = await ctx.supabase.from("equipment").insert({
    company_id: ctx.company.companyId,
    warehouse_id: d.warehouseId,
    zone_id: d.zoneId,
    name: d.name,
    category: d.category,
    manufacturer: d.manufacturer,
    serial_number: d.serialNumber,
  });
  if (error) return { error: error.code === "23503" ? "The zone must be in the chosen warehouse." : NO_MANAGE, values };
  revalidatePath(PATH);
  return { ok: true, message: `${d.name} added.` };
}

const scheduleSchema = z.object({
  equipmentId: z.uuid("Choose equipment"),
  title: z.string().trim().min(3, "Describe the task").max(200),
  intervalDays: z.coerce.number().int().min(1, "At least 1 day").max(3650),
  firstDue: z.iso.date("Choose the first due date"),
});

export async function addSchedule(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const values = formValues(formData, ["equipmentId", "title", "intervalDays", "firstDue"]);
  const parsed = scheduleSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const { data: eq } = await ctx.supabase.from("equipment").select("id, warehouse_id").eq("id", parsed.data.equipmentId).single();
  if (!eq) return { error: "Choose equipment.", values };

  const { error } = await ctx.supabase.from("maintenance_schedules").insert({
    company_id: ctx.company.companyId,
    warehouse_id: eq.warehouse_id,
    equipment_id: eq.id,
    title: parsed.data.title,
    interval_days: parsed.data.intervalDays,
    next_due_at: new Date(`${parsed.data.firstDue}T09:00:00Z`).toISOString(),
  });
  if (error) return { error: NO_MANAGE, values };
  revalidatePath(PATH);
  return { ok: true, message: "Schedule added. Its first task is in the list." };
}

export async function updateTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const id = String(formData.get("id"));
  const status = z.enum(["pending", "in_progress", "completed", "cancelled"]).safeParse(formData.get("status"));
  if (!status.success) return { error: "Choose a status." };
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 5000);
  if (status.data === "completed" && notes.length < 2) return { error: "Write what was done before completing the task." };

  const { data, error } = await ctx.supabase
    .from("maintenance_tasks")
    .update({ status: status.data, notes: notes || null })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { error: "Viewers cannot update tasks." };
  revalidatePath(PATH);
  revalidatePath("/app", "layout");
  return { ok: true };
}

const inspectionSchema = z
  .object({
    warehouseId: z.uuid("Choose a warehouse"),
    target: z.string().regex(/^(zone|equipment):[0-9a-f-]{36}$/, "Choose what was inspected"),
    result: z.enum(["pass", "fail", "needs_attention"]),
    findings: z.string().trim().max(5000).transform((v) => v || null),
    correctiveAction: z.string().trim().max(5000).transform((v) => v || null),
  })
  .refine((d) => d.result === "pass" || d.findings, { path: ["findings"], message: "Describe what was found" });

export async function recordInspection(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const values = formValues(formData, ["warehouseId", "target", "result", "findings", "correctiveAction"]);
  const parsed = inspectionSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const [kind, targetId] = parsed.data.target.split(":") as ["zone" | "equipment", string];

  const { error } = await ctx.supabase.from("inspections").insert({
    company_id: ctx.company.companyId,
    warehouse_id: parsed.data.warehouseId,
    zone_id: kind === "zone" ? targetId : null,
    equipment_id: kind === "equipment" ? targetId : null,
    result: parsed.data.result,
    findings: parsed.data.findings,
    corrective_action: parsed.data.correctiveAction,
  });
  if (error) return { error: error.code === "23503" ? "That item is not in the chosen warehouse." : "Viewers cannot record inspections.", values };
  revalidatePath(PATH);
  return { ok: true, message: "Inspection recorded." };
}
