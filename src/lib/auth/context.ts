import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Enums, Tables } from "@/types/database";

export const ACTIVE_COMPANY_COOKIE = "cco-company";

export type Role = Enums<"member_role">;
export type AccessState = "active" | "grace" | "trial" | "locked";

export type Membership = { companyId: string; companyName: string; role: Role };

/** The signed-in user, verified from the JWT, or null. Cached per request. */
export const getSession = cache(async () => {
  if (!getPublicEnv()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { supabase, userId: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
});

export async function requireUser(next?: string) {
  const session = await getSession();
  if (!session) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return session;
}

export const getMemberships = cache(async (): Promise<Membership[]> => {
  const session = await getSession();
  if (!session) return [];
  const { supabase, userId } = session;

  // One round trip: memberships with their company names embedded.
  const { data: rows, error } = await supabase
    .from("company_members")
    .select("company_id, role, created_at, companies(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load memberships: ${error.message}`);

  return (rows ?? []).map((r) => {
    const company = r.companies as { name: string } | { name: string }[] | null;
    const name = Array.isArray(company) ? company[0]?.name : company?.name;
    return { companyId: r.company_id, companyName: name ?? "Company", role: r.role };
  });
});

export type AppContext = Awaited<ReturnType<typeof loadAppContext>>;

async function loadAppContext() {
  const session = await requireUser("/app");
  const memberships = await getMemberships();
  if (memberships.length === 0) redirect("/onboarding");

  const preferred = (await cookies()).get(ACTIVE_COMPANY_COOKIE)?.value;
  const company = memberships.find((m) => m.companyId === preferred) ?? memberships[0]!;

  const [{ data: accessRows, error: accessError }, { data: profile }] = await Promise.all([
    session.supabase.rpc("company_access_state", { p_company_id: company.companyId }),
    session.supabase.from("profiles").select("*").eq("id", session.userId).single(),
  ]);
  if (accessError) throw new Error(`Could not load access state: ${accessError.message}`);

  const access = accessRows?.[0];
  return {
    ...session,
    memberships,
    company,
    role: company.role,
    profile: profile as Tables<"profiles"> | null,
    access: {
      state: (access?.state ?? "locked") as AccessState,
      endsAt: access?.ends_at ?? null,
      planCode: access?.plan_code ?? null,
      planName: access?.plan_name ?? null,
    },
  };
}

/** Everything a page inside /app needs. Redirects when signed out or without a company. */
export const getAppContext = cache(loadAppContext);

/** Current path, forwarded by the proxy (layouts cannot read it otherwise). */
export async function currentPath(): Promise<string> {
  return (await headers()).get("x-pathname") ?? "/app";
}
