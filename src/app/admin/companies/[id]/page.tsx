import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/form-parts";
import { roleLabels } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/form";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { countryName } from "@/lib/countries";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { extendTrial, setCompanyStatus, setDemo } from "../../actions";

const day = (iso: string | null) => (iso ? (formatDateTime(iso).split(",")[0] ?? "") : "never");
const limit = (used: number, max: number | null) => `${used} of ${max ?? "unlimited"}`;

export default async function AdminCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requirePlatformAdmin();
  const { data: c } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();

  const [{ data: members }, { data: usageRows }, { data: payments }, { data: access }] = await Promise.all([
    supabase.from("company_members").select("user_id, role, created_at").eq("company_id", id),
    supabase.rpc("company_usage", { p_company_id: id }),
    supabase.from("payment_records").select("id, created_at, amount_cents, currency, status, provider_payment_id").eq("company_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.rpc("company_access_state", { p_company_id: id }),
  ]);
  const { data: people } = members?.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", members.map((m) => m.user_id))
    : { data: [] };
  const usage = usageRows?.[0];
  const state = access?.[0];

  return (
    <>
      <PageHeader
        title={c.name}
        description={`${countryName(c.country_code)}${c.vat_number ? `, VAT ${c.vat_number}` : ""}. Signed up ${day(c.created_at)}.`}
        actions={
          <>
            <Badge tone="info">{c.status}</Badge>
            {c.is_demo ? <Badge tone="warn">Demo</Badge> : null}
          </>
        }
      />
      <div className="grid gap-6">
        <Panel>
          <PanelHeader title="Access and usage" />
          <PanelBody className="grid gap-4 sm:grid-cols-3 type-small">
            <div>
              <p className="text-ink-muted">Paywall state</p>
              <p className="font-medium text-ink">
                {state?.state ?? "unknown"}
                {state?.ends_at ? ` until ${day(state.ends_at)}` : ""}
              </p>
            </div>
            <div>
              <p className="text-ink-muted">Plan</p>
              <p className="font-medium text-ink">{usage?.plan_name ?? ""}</p>
            </div>
            <div>
              <p className="text-ink-muted">Trial ends</p>
              <p className="font-medium text-ink">{day(c.trial_ends_at)}</p>
            </div>
            {usage ? (
              <>
                <div>
                  <p className="text-ink-muted">Warehouses</p>
                  <p className="font-medium text-ink">{limit(usage.warehouses, usage.max_warehouses)}</p>
                </div>
                <div>
                  <p className="text-ink-muted">Sensors</p>
                  <p className="font-medium text-ink">{limit(usage.sensors, usage.max_sensors)}</p>
                </div>
                <div>
                  <p className="text-ink-muted">Users</p>
                  <p className="font-medium text-ink">{limit(usage.users, usage.max_users)}</p>
                </div>
              </>
            ) : null}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Actions" description="Changes are recorded in the audit log." />
          <PanelBody className="grid gap-5">
            <ActionForm action={extendTrial} hidden={{ id }}>
              <label htmlFor="days" className="type-small text-ink">
                Extend trial by
              </label>
              <Input id="days" name="days" defaultValue="14" inputMode="numeric" className="w-20" />
              <span className="type-small text-ink-muted">days</span>
              <SubmitButton size="sm" variant="secondary" pendingLabel="Saving">
                Extend trial
              </SubmitButton>
            </ActionForm>
            <ActionForm action={setCompanyStatus} hidden={{ id }}>
              <label htmlFor="status" className="type-small text-ink">
                Status
              </label>
              <Select id="status" name="status" defaultValue={c.status} className="w-44">
                {["trial", "active", "past_due", "suspended", "cancelled"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <SubmitButton size="sm" variant="secondary" pendingLabel="Saving">
                Save status
              </SubmitButton>
            </ActionForm>
            <ActionForm action={setDemo} hidden={{ id, demo: c.is_demo ? "false" : "true" }}>
              <SubmitButton size="sm" variant="secondary" pendingLabel="Saving">
                {c.is_demo ? "Remove demo flag" : "Mark as demo account (no limits, no paywall)"}
              </SubmitButton>
            </ActionForm>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Members" />
          <Table caption="Members">
            <THead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Joined</Th>
              </tr>
            </THead>
            <TBody>
              {(members ?? []).map((m) => {
                const p = (people ?? []).find((x) => x.id === m.user_id);
                return (
                  <Tr key={m.user_id}>
                    <Td>
                      {p?.full_name || "Member"}
                      <span className="block type-caption text-ink-muted">{p?.email}</span>
                    </Td>
                    <Td>{roleLabels[m.role]}</Td>
                    <Td className="text-ink-muted">{day(m.created_at)}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </Panel>

        <Panel>
          <PanelHeader title="Payments" />
          {payments?.length ? (
            <Table caption="Payments">
              <THead>
                <tr>
                  <Th>Date</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Status</Th>
                  <Th>Razorpay payment</Th>
                </tr>
              </THead>
              <TBody>
                {payments.map((p) => (
                  <Tr key={p.id}>
                    <Td className="text-ink-muted">{day(p.created_at)}</Td>
                    <Td numeric>{formatMoney(p.amount_cents, p.currency)}</Td>
                    <Td>{p.status}</Td>
                    <Td className="font-mono text-xs">{p.provider_payment_id ?? ""}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="px-5 py-6 type-small text-ink-muted">No payments.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
