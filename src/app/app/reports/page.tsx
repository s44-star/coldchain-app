import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { getAppContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/roles";
import { REPORTS } from "@/lib/reports";
import { timeAgo } from "@/lib/monitoring";
import { ReportForm } from "./report-form";

export const metadata: Metadata = { title: "Reports" };

const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

export default async function ReportsPage() {
  const ctx = await getAppContext();
  const [{ data: warehouses }, { data: history }] = await Promise.all([
    ctx.supabase.from("warehouses").select("id, name").eq("company_id", ctx.company.companyId).order("name"),
    ctx.supabase.from("reports").select("id, type, format, created_at, row_count").eq("company_id", ctx.company.companyId).order("created_at", { ascending: false }).limit(10),
  ]);

  const types = Object.entries(REPORTS)
    .filter(([key]) => key !== "audit_trail" || can.manageTeam(ctx.role))
    .map(([value, label]) => ({ value, label }));

  return (
    <>
      <PageHeader title="Reports" description="Evidence for inspections and audits. Times use each warehouse's own time zone." />
      {warehouses?.length ? (
        <div className="grid gap-6">
          <Panel>
            <PanelHeader title="Create a report" />
            <PanelBody>
              <ReportForm warehouses={warehouses} types={types} from={isoDay(-7)} to={isoDay(0)} />
            </PanelBody>
          </Panel>
          {history?.length ? (
            <Panel>
              <PanelHeader title="Recent exports" description="Every export is recorded in the audit trail." />
              <Table caption="Recent exports">
                <THead>
                  <tr>
                    <Th>Report</Th>
                    <Th>Format</Th>
                    <Th className="text-right">Rows</Th>
                    <Th>When</Th>
                  </tr>
                </THead>
                <TBody>
                  {history.map((r) => (
                    <Tr key={r.id}>
                      <Td>{REPORTS[r.type]}</Td>
                      <Td className="uppercase">{r.format}</Td>
                      <Td numeric>{r.row_count ?? ""}</Td>
                      <Td className="text-ink-muted">{timeAgo(r.created_at)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Panel>
          ) : null}
        </div>
      ) : (
        <EmptyState title="No warehouses yet">Reports become available once a warehouse has readings.</EmptyState>
      )}
    </>
  );
}
