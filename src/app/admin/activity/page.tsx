import type { Metadata } from "next";
import { ACTIVITY_PAGE_SIZE, ActivityTable, parseActivityParams } from "@/components/app/activity-table";
import { PageHeader } from "@/components/app/page-header";
import { requirePlatformAdmin } from "@/lib/auth/admin";

export const metadata: Metadata = { title: "Activity" };

export default async function AdminActivityPage({ searchParams }: { searchParams: Promise<{ type?: string; before?: string }> }) {
  const { supabase } = await requirePlatformAdmin();
  const { type, before } = parseActivityParams(await searchParams);

  let query = supabase
    .from("audit_logs")
    .select("id, company_id, actor_email, action, resource_type, resource_id, metadata, created_at")
    .order("id", { ascending: false })
    .limit(ACTIVITY_PAGE_SIZE);
  if (type) query = query.eq("resource_type", type);
  if (before) query = query.lt("id", before);
  const { data: rows } = await query;

  const ids = [...new Set((rows ?? []).map((r) => r.company_id).filter((id): id is string => Boolean(id)))];
  const { data: companies } = ids.length ? await supabase.from("companies").select("id, name").in("id", ids) : { data: [] };
  const companyNames = new Map((companies ?? []).map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader title="Activity" description="Changes across every company and the platform, newest first." />
      <ActivityTable rows={rows ?? []} basePath="/admin/activity" type={type} companyNames={companyNames} />
    </>
  );
}
