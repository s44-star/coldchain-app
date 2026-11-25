"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAppContext } from "@/lib/auth/context";
import { fieldErrors, formValues, type FormState } from "@/lib/validation";

const NO_PERMISSION = "Viewers cannot change incidents.";

const createSchema = z.object({
  warehouseId: z.uuid("Choose a warehouse"),
  zoneId: z.union([z.uuid(), z.literal("")]).transform((v) => (v === "" ? null : v)),
  alertId: z.union([z.uuid(), z.literal("")]).transform((v) => (v === "" ? null : v)),
  title: z.string().trim().min(3, "Describe the incident in a few words").max(200),
  severity: z.enum(["info", "warning", "critical"]),
  description: z.string().trim().max(5000).transform((v) => (v === "" ? null : v)),
});

export async function createIncident(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const values = formValues(formData, ["warehouseId", "zoneId", "alertId", "title", "severity", "description"]);
  const parsed = createSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const { data, error } = await ctx.supabase
    .from("incidents")
    .insert({
      company_id: ctx.company.companyId,
      warehouse_id: parsed.data.warehouseId,
      zone_id: parsed.data.zoneId,
      alert_id: parsed.data.alertId,
      title: parsed.data.title,
      severity: parsed.data.severity,
      description: parsed.data.description,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("incident insert failed", error?.code, error?.message);
    return { error: error?.code === "23503" ? "The zone must belong to the chosen warehouse." : NO_PERMISSION, values };
  }
  revalidatePath("/app/incidents");
  redirect(`/app/incidents/${data.id}`);
}

const updateSchema = z.object({
  status: z.enum(["open", "under_investigation", "action_required", "resolved", "closed"]),
  rootCause: z.string().trim().max(5000),
  correctiveAction: z.string().trim().max(5000),
  resolution: z.string().trim().max(5000),
});

export async function updateIncident(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const id = String(formData.get("id"));
  const values = formValues(formData, ["status", "rootCause", "correctiveAction", "resolution"]);
  const parsed = updateSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  if ((parsed.data.status === "resolved" || parsed.data.status === "closed") && parsed.data.resolution.length < 3) {
    return { fieldErrors: { resolution: "Write how the incident was resolved before resolving or closing it" }, values };
  }

  const { data, error } = await ctx.supabase
    .from("incidents")
    .update({
      status: parsed.data.status,
      root_cause: parsed.data.rootCause || null,
      corrective_action: parsed.data.correctiveAction || null,
      resolution: parsed.data.resolution || null,
    })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { error: error?.message?.includes("resolution") ? error.message : NO_PERMISSION, values };
  revalidatePath(`/app/incidents/${id}`);
  return { ok: true, message: "Incident updated.", values };
}

export async function addIncidentComment(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const id = String(formData.get("incidentId"));
  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 2) return { fieldErrors: { body: "Write an update first" } };
  if (body.length > 5000) return { fieldErrors: { body: "Keep updates under 5000 characters" } };

  const { error } = await ctx.supabase
    .from("incident_updates")
    .insert({ company_id: ctx.company.companyId, incident_id: id, body });
  if (error) return { error: NO_PERMISSION };
  revalidatePath(`/app/incidents/${id}`);
  return { ok: true, message: "Update added." };
}

const ALLOWED = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]],
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]],
} as const;

/**
 * The browser uploads the file straight to private storage (RLS checks the
 * path); this action then verifies the file really is what it claims by its
 * first bytes, and records it. Anything else is deleted.
 */
export async function recordAttachment(input: {
  incidentId: string;
  path: string;
  fileName: string;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getAppContext();
  const prefix = `${ctx.company.companyId}/${input.incidentId}/`;
  if (!input.path.startsWith(prefix) || input.path.includes("..")) return { ok: false, error: "Invalid file location." };

  const bucket = ctx.supabase.storage.from("incident-attachments");
  const { data: blob, error } = await bucket.download(input.path);
  if (error || !blob) return { ok: false, error: "The upload did not arrive. Try again." };

  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const mime = (Object.keys(ALLOWED) as (keyof typeof ALLOWED)[]).find((type) =>
    ALLOWED[type].some((sig) => sig.every((byte, i) => head[i] === byte)) &&
    (type !== "image/webp" || String.fromCharCode(...head.slice(8, 12)) === "WEBP"),
  );
  if (!mime || blob.size > 10 * 1024 * 1024) {
    await bucket.remove([input.path]);
    return { ok: false, error: "Only photos (JPEG, PNG, WebP) and PDF files up to 10 MB can be attached." };
  }

  const { error: insertError } = await ctx.supabase.from("incident_attachments").insert({
    company_id: ctx.company.companyId,
    incident_id: input.incidentId,
    storage_path: input.path,
    file_name: input.fileName.slice(0, 255) || "attachment",
    mime_type: mime,
    size_bytes: blob.size,
  });
  if (insertError) {
    await bucket.remove([input.path]);
    return { ok: false, error: "Could not save the attachment." };
  }
  revalidatePath(`/app/incidents/${input.incidentId}`);
  return { ok: true };
}
