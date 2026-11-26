"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_COMPANY_COOKIE, getMemberships } from "@/lib/auth/context";

/** Switches the active company; only companies the user belongs to are accepted. */
export async function switchCompany(formData: FormData): Promise<void> {
  const target = String(formData.get("companyId") ?? "");
  const memberships = await getMemberships();
  if (memberships.some((m) => m.companyId === target)) {
    (await cookies()).set(ACTIVE_COMPANY_COOKIE, target, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  redirect("/app");
}
