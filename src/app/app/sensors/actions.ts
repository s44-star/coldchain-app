"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { processDeliveries } from "@/lib/delivery";
import { z } from "zod";
import { getAppContext } from "@/lib/auth/context";
import { fieldErrors, formValues, type FormState } from "@/lib/validation";

const NO_PERMISSION = "Only the owner, an admin, or a manager of this warehouse can manage sensors.";

const sensorSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120),
  externalDeviceId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._:-]{1,128}$/, "Use the serial number or device ID printed on the logger (letters, digits, . _ : -)"),
  type: z.enum(["temperature", "humidity", "temperature_humidity"]),
  zoneId: z.union([z.uuid(), z.literal("")]).transform((v) => (v === "" ? null : v)),
  manufacturer: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v === "" ? null : v)),
});

export async function registerSensor(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const warehouseId = String(formData.get("warehouseId"));
  const values = formValues(formData, ["name", "externalDeviceId", "type", "zoneId", "manufacturer"]);
  const parsed = sensorSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const { data, error } = await ctx.supabase
    .from("sensors")
    .insert({
      company_id: ctx.company.companyId,
      warehouse_id: warehouseId,
      zone_id: parsed.data.zoneId,
      name: parsed.data.name,
      external_device_id: parsed.data.externalDeviceId,
      type: parsed.data.type,
      manufacturer: parsed.data.manufacturer,
    })
    .select("id")
    .single();
  if (error?.code === "53400") return { error: error.message, values };
  if (error || !data) {
    return {
      error: error?.code === "23505" ? "A sensor with this device ID is already registered." : NO_PERMISSION,
      values,
    };
  }
  revalidatePath(`/app/warehouses/${warehouseId}`);
  return { ok: true, message: `${parsed.data.name} registered. Open it to create its device key.`, data: { id: data.id } };
}

export async function updateSensorZone(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const id = String(formData.get("id"));
  const zone = String(formData.get("zoneId") ?? "");
  const { data, error } = await ctx.supabase
    .from("sensors")
    .update({ zone_id: zone === "" ? null : zone })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { error: NO_PERMISSION };
  revalidatePath(`/app/sensors/${id}`);
  return { ok: true, message: "Placement saved." };
}

export async function retireSensor(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const id = String(formData.get("id"));
  const { data, error } = await ctx.supabase
    .from("sensors")
    .update({ status: "retired", archived_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { error: NO_PERMISSION };
  await ctx.supabase.from("sensor_api_keys").update({ revoked_at: new Date().toISOString() }).eq("sensor_id", id).is("revoked_at", null);
  revalidatePath(`/app/sensors/${id}`);
  return { ok: true, message: "Sensor retired. Its keys no longer work." };
}

export async function createDeviceKey(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const sensorId = String(formData.get("sensorId"));
  const name = String(formData.get("name") ?? "").trim().slice(0, 80) || null;

  const raw = `cco_live_${randomBytes(32).toString("base64url").replace(/[-_]/g, "").slice(0, 40).padEnd(40, "0")}`;
  const { error } = await ctx.supabase.from("sensor_api_keys").insert({
    company_id: ctx.company.companyId,
    sensor_id: sensorId,
    name,
    key_prefix: raw.slice(0, 16).replace(/[^A-Za-z0-9_]/g, ""),
    key_hash: createHash("sha256").update(raw, "utf8").digest("hex"),
  });
  if (error) return { error: NO_PERMISSION };
  revalidatePath(`/app/sensors/${sensorId}`);
  return { ok: true, message: "Copy this key now. It will not be shown again.", data: { key: raw } };
}

export async function revokeDeviceKey(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const sensorId = String(formData.get("sensorId"));
  const { data, error } = await ctx.supabase
    .from("sensor_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", String(formData.get("id")))
    .select("id");
  if (error || !data?.length) return { error: NO_PERMISSION };
  revalidatePath(`/app/sensors/${sensorId}`);
  return { ok: true };
}

export async function simulateReadings(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const sensorId = String(formData.get("sensorId"));
  const excursion = formData.get("mode") === "excursion";
  const { data, error } = await ctx.supabase.rpc("simulate_readings", {
    p_sensor_id: sensorId,
    p_hours: excursion ? 1 : 24,
    p_excursion: excursion,
  });
  if (error) return { error: error.message };
  const result = (data ?? {}) as { accepted?: number; alerts?: number };
  if (result.alerts) after(() => processDeliveries(20).catch((e) => console.error("inline delivery failed", e)));
  revalidatePath("/app", "layout");
  return {
    ok: true,
    message: excursion
      ? `Simulated excursion sent: ${result.alerts ? "an alert was raised" : "no new alert (one is already open)"}.`
      : `${result.accepted ?? 0} simulated readings added for the last 24 hours.`,
  };
}
