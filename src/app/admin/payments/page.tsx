import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export default async function AdminPaymentsPage() {
  const { supabase } = await requirePlatformAdmin();
  const [{ data: payments }, { data: companies }, { data: events }] = await Promise.all([
    supabase.from("payment_records").select("id, company_id, created_at, amount_cents, currency, status, failure_reason").order("created_at", { ascending: false }).limit(100),
    supabase.from("companies").select("id, name"),
    supabase.from("payment_webhook_events").select("id, received_at, event_type, signature_valid, processed_at, error").order("received_at", { ascending: false }).limit(30),
  ]);
  const name = new Map((companies ?? []).map((c) => [c.id, c.name]));
  const captured = (payments ?? []).filter((p) => p.status === "captured").reduce((sum, p) => sum + p.amount_cents, 0);

  return (
    <>
      <PageHeader title="Payments" description={`${formatMoney(captured)} received across the last ${payments?.length ?? 0} payments.`} />
      <div className="grid gap-6">
        <Panel>
          <Table caption="Payments">
            <THead>
              <tr>
                <Th>Date</Th>
                <Th>Company</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {(payments ?? []).map((p) => (
                <Tr key={p.id}>
                  <Td className="text-ink-muted">{formatDateTime(p.created_at)}</Td>
                  <Td>
                    <Link href={`/admin/companies/${p.company_id}`} className="text-primary underline-offset-4 hover:underline">
                      {name.get(p.company_id) ?? "Company"}
                    </Link>
                  </Td>
                  <Td numeric>{formatMoney(p.amount_cents, p.currency)}</Td>
                  <Td>
                    <Badge tone={p.status === "captured" ? "ok" : p.status === "failed" ? "critical" : "neutral"}>{p.status}</Badge>
                    {p.failure_reason ? <span className="block type-caption text-ink-muted">{p.failure_reason}</span> : null}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Panel>
        <Panel>
          <PanelHeader title="Razorpay webhook events" description="Failed or unsigned events need a look." />
          <Table caption="Webhook events">
            <THead>
              <tr>
                <Th>Received</Th>
                <Th>Event</Th>
                <Th>Result</Th>
              </tr>
            </THead>
            <TBody>
              {(events ?? []).map((e) => (
                <Tr key={e.id}>
                  <Td className="text-ink-muted">{formatDateTime(e.received_at)}</Td>
                  <Td className="font-mono text-xs">{e.event_type}</Td>
                  <Td>
                    {!e.signature_valid ? (
                      <Badge tone="critical">Bad signature</Badge>
                    ) : e.error ? (
                      <Badge tone="critical">{e.error.slice(0, 60)}</Badge>
                    ) : e.processed_at ? (
                      <Badge tone="ok">Processed</Badge>
                    ) : (
                      <Badge tone="warn">Pending</Badge>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Panel>
      </div>
    </>
  );
}
