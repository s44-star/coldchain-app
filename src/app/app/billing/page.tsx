import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { getAppContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/roles";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { razorpayConfig } from "@/lib/razorpay";
import { PlanPicker, type PlanView } from "./plan-picker";

export const metadata: Metadata = { title: "Billing" };

function dateOnly(iso: string | null): string {
  return iso ? formatDateTime(iso).split(",")[0] ?? "" : "";
}

export default async function BillingPage() {
  const ctx = await getAppContext();
  const { state, endsAt, planName } = ctx.access;

  const status =
    state === "active"
      ? { tone: "ok" as const, title: `${planName} plan, paid until ${dateOnly(endsAt)}` }
      : state === "grace"
        ? { tone: "warn" as const, title: `Your subscription ended. Access stops on ${dateOnly(endsAt)}.` }
        : state === "trial"
          ? { tone: "info" as const, title: `Free trial until ${dateOnly(endsAt)}` }
          : { tone: "critical" as const, title: "Your free trial or subscription has ended" };

  if (!can.manageBilling(ctx.role)) {
    return (
      <>
        <PageHeader title="Billing" />
        <Callout tone={status.tone} title={status.title}>
          Only the company owner can choose or pay for a plan.{" "}
          {state === "locked" ? "Ask them to renew to restore access for the whole team." : null}
        </Callout>
      </>
    );
  }

  const [{ data: planRows }, { count: capturedCount }, { data: invoices }, { data: usageRows }] = await Promise.all([
    ctx.supabase.from("subscription_plans").select("*").eq("is_active", true).eq("is_public", true).order("sort_order"),
    ctx.supabase
      .from("payment_records")
      .select("id", { count: "exact", head: true })
      .eq("company_id", ctx.company.companyId)
      .eq("status", "captured"),
    ctx.supabase
      .from("invoices")
      .select("id, number, issued_at, total_cents, currency, status")
      .eq("company_id", ctx.company.companyId)
      .order("issued_at", { ascending: false }),
    ctx.supabase.rpc("company_usage", { p_company_id: ctx.company.companyId }),
  ]);
  const usage = usageRows?.[0];

  const plans: PlanView[] = (planRows ?? []).map((p) => ({
    code: p.code,
    name: p.name,
    description: p.description,
    currency: p.currency,
    monthly: p.monthly_price_cents,
    annual: p.annual_price_cents,
    setupFee: p.setup_fee_cents,
    features: Array.isArray(p.features) ? p.features.filter((f): f is string => typeof f === "string") : [],
    requiresContact: p.requires_contact,
  }));

  const nonce = (await headers()).get("x-nonce") ?? "";

  return (
    <>
      <PageHeader title="Billing" description="Choose a plan for your company. Every member keeps access while it is paid." />
      <div className="grid gap-8">
        <Callout tone={status.tone} title={status.title}>
          {state === "locked" ? "Choose a plan to restore access for your whole team. Your data is kept." : null}
        </Callout>

        {usage ? (
          <dl className="grid grid-cols-2 gap-4 rounded-panel border border-line bg-surface p-5 sm:grid-cols-4">
            {[
              ["Warehouses", usage.warehouses, usage.max_warehouses],
              ["Zones", usage.zones, usage.max_zones],
              ["Sensors", usage.sensors, usage.max_sensors],
              ["Users", usage.users, usage.max_users],
            ].map(([label, used, max]) => (
              <div key={String(label)}>
                <dt className="type-caption text-ink-muted">{label}</dt>
                <dd className="type-small font-medium tabular text-ink">
                  {used} of {max ?? "unlimited"}
                </dd>
              </div>
            ))}
            <p className="col-span-full type-caption text-ink-muted">Limits of the {usage.plan_name} plan{state === "trial" ? " during your trial" : ""}.</p>
          </dl>
        ) : null}

        <PlanPicker
          plans={plans}
          nonce={nonce}
          setupPaid={(capturedCount ?? 0) > 0}
          paymentsEnabled={razorpayConfig() !== null}
          currentPlan={state === "active" || state === "grace" ? ctx.access.planCode : null}
        />

        <Panel>
          <PanelHeader title="Invoices" />
          {invoices?.length ? (
            <Table caption="Invoices">
              <THead>
                <tr>
                  <Th>Number</Th>
                  <Th>Date</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">
                    <span className="sr-only">Open</span>
                  </Th>
                </tr>
              </THead>
              <TBody>
                {invoices.map((inv) => (
                  <Tr key={inv.id}>
                    <Td className="tabular font-medium">{inv.number}</Td>
                    <Td className="tabular text-ink-muted">{dateOnly(inv.issued_at)}</Td>
                    <Td numeric>{formatMoney(inv.total_cents, inv.currency)}</Td>
                    <Td className="text-right">
                      <Link href={`/app/billing/invoices/${inv.id}`} className="text-primary underline-offset-4 hover:underline">
                        View
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <div className="p-5">
              <EmptyState title="No invoices yet">Your invoice appears here after your first payment.</EmptyState>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
