"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAppContext } from "@/lib/auth/context";
import { fieldErrors, formValues, type FormState } from "@/lib/validation";

const num = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(",", ".").replace("−", "-"))
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v >= min && v <= max), `${label} must be between ${min} and ${max}`);

const zoneSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(120),
    type: z.enum(["room", "refrigerated", "freezer", "zone"]),
    minTemp: num(-90, 60, "Temperature"),
    maxTemp: num(-90, 60, "Temperature"),
    minHumidity: num(0, 100, "Humidity"),
    maxHumidity: num(0, 100, "Humidity"),
    interval: z.coerce.number().int().min(1, "At least 1 minute").max(1440, "At most 1440 minutes"),
  })
  .refine((d) => d.minTemp === null || d.maxTemp === null || d.minTemp < d.maxTemp, {
    path: ["maxTemp"],
    message: "Maximum must be higher than the minimum",
  })
  .refine((d) => d.minHumidity === null || d.maxHumidity === null || d.minHumidity < d.maxHumidity, {
    path: ["maxHumidity"],
    message: "Maximum must be higher than the minimum",
  });

const FIELDS = ["name", "type", "minTemp", "maxTemp", "minHumidity", "maxHumidity", "interval"];

function row(d: z.infer<typeof zoneSchema>) {
  return {
    name: d.name,
    type: d.type,
    min_temp_c: d.minTemp,
    max_temp_c: d.maxTemp,
    min_humidity_pct: d.minHumidity,
    max_humidity_pct: d.maxHumidity,
    monitoring_interval_minutes: d.interval,
  };
}

const NO_PERMISSION = "Only the owner, an admin, or a manager of this warehouse can change zones.";

export async function createZone(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const warehouseId = String(formData.get("warehouseId"));
  const values = formValues(formData, FIELDS);
  const parsed = zoneSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const { error } = await ctx.supabase
    .from("storage_zones")
    .insert({ ...row(parsed.data), company_id: ctx.company.companyId, warehouse_id: warehouseId });
  if (error) {
    if (error.code === "53400") return { error: error.message, values };
    return { error: error.code === "23505" ? "A zone with this name already exists here." : NO_PERMISSION, values };
  }
  revalidatePath(`/app/warehouses/${warehouseId}`);
  return { ok: true, message: `${parsed.data.name} added.` };
}

export async function updateZone(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const id = String(formData.get("id"));
  const values = formValues(formData, FIELDS);
  const parsed = zoneSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const { data, error } = await ctx.supabase.from("storage_zones").update(row(parsed.data)).eq("id", id).select("id");
  if (error || !data?.length) return { error: error?.code === "23505" ? "A zone with this name already exists here." : NO_PERMISSION, values };
  revalidatePath(`/app/zones/${id}`);
  return { ok: true, message: "Limits saved. New readings are checked against them.", values };
}

export async function archiveZone(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const id = String(formData.get("id"));
  const { data, error } = await ctx.supabase
    .from("storage_zones")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .select("warehouse_id");
  if (error || !data?.length) return { error: NO_PERMISSION };
  revalidatePath("/app", "layout");
  redirect(`/app/warehouses/${data[0]!.warehouse_id}`);
}

const manualSchema = z.object({
  sensorId: z.uuid("Choose a sensor"),
  temperature: num(-90, 60, "Temperature"),
  humidity: num(0, 100, "Humidity"),
});

export async function addManualReading(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const zoneId = String(formData.get("zoneId"));
  const values = formValues(formData, ["sensorId", "temperature", "humidity"]);
  const parsed = manualSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  if (parsed.data.temperature === null && parsed.data.humidity === null) {
    return { fieldErrors: { temperature: "Enter a temperature or a humidity value" }, values };
  }

  const { data: sensor } = await ctx.supabase
    .from("sensors")
    .select("id, warehouse_id, zone_id")
    .eq("id", parsed.data.sensorId)
    .single();
  if (!sensor || sensor.zone_id !== zoneId) return { error: "Choose a sensor in this zone.", values };

  const { error } = await ctx.supabase.from("sensor_readings").insert({
    company_id: ctx.company.companyId,
    warehouse_id: sensor.warehouse_id,
    zone_id: zoneId,
    sensor_id: sensor.id,
    recorded_at: new Date().toISOString(),
    temperature_c: parsed.data.temperature,
    humidity_pct: parsed.data.humidity,
    source: "manual",
  });
  if (error) return { error: "Only operators, managers, admins and the owner can record readings.", values };
  revalidatePath(`/app/zones/${zoneId}`);
  return { ok: true, message: "Reading recorded." };
}
