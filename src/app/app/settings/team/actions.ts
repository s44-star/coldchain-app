"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAppContext } from "@/lib/auth/context";
import { ASSIGNABLE_ROLES, can } from "@/lib/auth/roles";
import { rateLimit, siteOrigin } from "@/lib/rate-limit";
import { emailSchema, fieldErrors, formValues, type FormState } from "@/lib/validation";
import type { Enums } from "@/types/database";

const PATH = "/app/settings/team";
const roleSchema = z.enum(ASSIGNABLE_ROLES as [Enums<"member_role">, ...Enums<"member_role">[]], {
  error: "Choose a role",
});
const FORBIDDEN: FormState = { error: "Only the owner or an admin can manage the team." };

export async function inviteMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  if (!can.manageTeam(ctx.role)) return FORBIDDEN;

  const values = formValues(formData, ["email", "role"]);
  const parsed = z.object({ email: emailSchema, role: roleSchema }).safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  if (!(await rateLimit(`invite:${ctx.company.companyId}`, 50, 86_400))) {
    return { error: "Daily invitation limit reached. Try again tomorrow.", values };
  }

  // Already a member? (profiles are visible for colleagues only)
  const { data: existing } = await ctx.supabase.from("profiles").select("id").eq("email", parsed.data.email);
  if (existing?.length) {
    const { count } = await ctx.supabase
      .from("company_members")
      .select("id", { count: "exact", head: true })
      .eq("company_id", ctx.company.companyId)
      .in("user_id", existing.map((p) => p.id));
    if (count) return { fieldErrors: { email: "This person is already in your team" }, values };
  }

  const token = randomBytes(32).toString("base64url");
  const { error } = await ctx.supabase.from("company_invitations").insert({
    company_id: ctx.company.companyId,
    email: parsed.data.email,
    role: parsed.data.role,
    token_hash: createHash("sha256").update(token, "utf8").digest("hex"),
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });

  if (error) {
    if (error.code === "23505") {
      return { fieldErrors: { email: "There is already an open invitation for this address. Withdraw it first." }, values };
    }
    console.error("invite insert failed", error.code, error.message);
    return { error: "We could not create the invitation. Try again.", values };
  }

  revalidatePath(PATH);
  return {
    ok: true,
    message: `Invitation created for ${parsed.data.email}. Send them this link; it works for 7 days.`,
    data: { link: `${await siteOrigin()}/invite/${token}` },
  };
}

export async function revokeInvitation(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  if (!can.manageTeam(ctx.role)) return FORBIDDEN;
  const { error } = await ctx.supabase
    .from("company_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", String(formData.get("id")))
    .eq("company_id", ctx.company.companyId);
  if (error) return { error: "Could not withdraw the invitation." };
  revalidatePath(PATH);
  return { ok: true };
}

export async function changeRole(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  if (!can.manageTeam(ctx.role)) return FORBIDDEN;
  const role = roleSchema.safeParse(formData.get("role"));
  if (!role.success) return { error: "Choose a valid role." };

  const { data, error } = await ctx.supabase
    .from("company_members")
    .update({ role: role.data })
    .eq("id", String(formData.get("memberId")))
    .eq("company_id", ctx.company.companyId)
    .select("id");
  if (error || !data?.length) return { error: "This role cannot be changed." };
  revalidatePath(PATH);
  return { ok: true };
}

export async function removeMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  if (!can.manageTeam(ctx.role)) return FORBIDDEN;
  const { data, error } = await ctx.supabase
    .from("company_members")
    .delete()
    .eq("id", String(formData.get("memberId")))
    .eq("company_id", ctx.company.companyId)
    .select("id");
  if (error || !data?.length) return { error: "This person cannot be removed." };
  revalidatePath(PATH);
  return { ok: true };
}

export async function transferOwnership(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getAppContext();
  if (!can.transferOwnership(ctx.role)) return { error: "Only the owner can transfer ownership." };
  const { error } = await ctx.supabase.rpc("transfer_ownership", {
    p_company_id: ctx.company.companyId,
    p_new_owner_id: String(formData.get("userId")),
  });
  if (error) return { error: error.message };
  revalidatePath("/app", "layout");
  return { ok: true };
}
