"use server";

import { revalidatePath } from "next/cache";
import { getAppContext } from "@/lib/auth/context";
import type { FormState } from "@/lib/validation";

export async function markAllRead(_prev: FormState): Promise<FormState> {
  const ctx = await getAppContext();
  const { error } = await ctx.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", ctx.userId)
    .is("read_at", null);
  if (error) return { error: "Could not update notifications." };
  revalidatePath("/app", "layout");
  return { ok: true };
}
