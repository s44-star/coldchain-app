"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_COMPANY_COOKIE, requireUser } from "@/lib/auth/context";
import type { FormState } from "@/lib/validation";

export async function acceptInvitation(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const { supabase } = await requireUser(`/invite/${encodeURIComponent(token)}`);

  const { data: companyId, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error || !companyId) {
    const known: Record<string, string> = {
      "42501": error?.message ?? "You cannot accept this invitation.",
      "22023": error?.message ?? "This invitation can no longer be used.",
      "23505": "You are already a member of this company.",
      P0002: "This invitation link is not valid.",
    };
    return { error: (error?.code && known[error.code]) || "We could not accept the invitation. Try again." };
  }

  (await cookies()).set(ACTIVE_COMPANY_COOKIE, companyId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/app");
}
