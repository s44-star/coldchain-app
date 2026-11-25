"use server";

import { revalidatePath } from "next/cache";
import { getAppContext } from "@/lib/auth/context";
import type { FormState } from "@/lib/validation";

const NO_PERMISSION = "Viewers cannot change alerts.";

export async function acknowledgeAlert(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const id = String(formData.get("id"));
  const { data, error } = await ctx.supabase
    .from("alerts")
    .update({ status: "acknowledged", assigned_to: ctx.userId })
    .eq("id", id)
    .eq("status", "open")
    .select("id");
  if (error || !data?.length) return { error: error ? NO_PERMISSION : "This alert was already acknowledged." };
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function resolveAlert(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const id = String(formData.get("id"));
  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length < 3) return { error: "Write what was done before resolving." };
  if (notes.length > 2000) return { error: "Keep the note under 2000 characters." };

  const { data, error } = await ctx.supabase
    .from("alerts")
    .update({ status: "resolved", resolution_notes: notes })
    .eq("id", id)
    .neq("status", "resolved")
    .select("id");
  if (error || !data?.length) return { error: error ? NO_PERMISSION : "This alert is already resolved." };
  revalidatePath("/app", "layout");
  return { ok: true };
}
