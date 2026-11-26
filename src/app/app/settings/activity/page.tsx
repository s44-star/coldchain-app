import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ACTIVITY_PAGE_SIZE, ActivityTable, parseActivityParams } from "@/components/app/activity-table";
import { PageHeader } from "@/components/app/page-header";
import { can } from "@/lib/auth/roles";
import { getAppContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ type?: string; before?: string }> }) {
  const ctx = await getAppContext();
  if (!can.manageTeam(ctx.role)) notFound();
  const { type, before } = parseActivityParams(await searchParams);

  let query = ctx.supabase
    .from("audit_logs")
    .select("id, company_id, actor_email, action, resource_type, resource_id, metadata, created_at")
    .eq("company_id", ctx.company.companyId)
    .order("id", { ascending: false })
    .limit(ACTIVITY_PAGE_SIZE);
  if (type) query = query.eq("resource_type", type);
  if (before) query = query.lt("id", before);
  const { data } = await query;

  return (
    <>
      <PageHeader
        title="Activity"
        description="Every change to your company's setup: who made it and when. This record cannot be edited or deleted, which inspectors and auditors rely on."
      />
      <ActivityTable rows={data ?? []} basePath="/app/settings/activity" type={type} />
    </>
  );
}
