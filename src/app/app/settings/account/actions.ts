"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAppContext } from "@/lib/auth/context";
import { fieldErrors, formValues, fullNameSchema, passwordSchema, type FormState } from "@/lib/validation";

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const values = formValues(formData, ["fullName", "phone"]);
  const parsed = z
    .object({
      fullName: fullNameSchema,
      phone: z
        .string()
        .trim()
        .max(32, "Use at most 32 characters")
        .regex(/^[+0-9 ()-]*$/, "Use digits, spaces and + only")
        .transform((v) => (v === "" ? null : v)),
    })
    .safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const { error } = await ctx.supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone, email_alerts: formData.get("emailAlerts") === "on" })
    .eq("id", ctx.userId);
  if (error) return { error: "Could not save your details. Try again.", values };
  revalidatePath("/app", "layout");
  return { ok: true, message: "Your details are saved.", values };
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  const parsed = passwordSchema.safeParse(formData.get("password"));
  if (!parsed.success) return { fieldErrors: { password: parsed.error.issues[0]?.message ?? "Invalid" } };
  if (formData.get("password") !== formData.get("confirm")) return { fieldErrors: { confirm: "The passwords do not match" } };

  const { error } = await ctx.supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    if (error.code === "same_password") return { fieldErrors: { password: "Choose a password you have not used here" } };
    if (error.code === "reauthentication_needed") return { error: "For security, sign out and sign in again, then change your password." };
    return { error: "Could not change your password. Try again." };
  }
  return { ok: true, message: "Password changed." };
}
