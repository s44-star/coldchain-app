import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/context";

/**
 * Super admin gate. Platform admins are granted only with SQL; anyone else
 * gets a 404 so the panel's existence is not revealed. RLS enforces the same
 * rule on every query the panel makes.
 */
export const requirePlatformAdmin = cache(async () => {
  const session = await requireUser("/admin");
  const { data } = await session.supabase.from("platform_admins").select("user_id").eq("user_id", session.userId).maybeSingle();
  if (!data) notFound();
  return session;
});
