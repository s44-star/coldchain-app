import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Badge, type Tone } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { countryName } from "@/lib/countries";
import { formatDateTime } from "@/lib/format";

const STATUS_TONE: Record<string, Tone> = { trial: "info", active: "ok", past_due: "warn", suspended: "critical", cancelled: "neutral" };
const day = (iso: string | null) => (iso ? (formatDateTime(iso).split(",")[0] ?? "") : "");

export default async function AdminCompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { supabase } = await requirePlatformAdmin();

  let query = supabase
    .from("companies")
    .select("id, name, country_code, status, trial_ends_at, is_demo, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (q.trim()) query = query.ilike("name", `%${q.trim().replace(/[%_]/g, "")}%`);

  const [{ data: companies }, { data: members }, { data: subs }] = await Promise.all([
    query,
    supabase.from("company_members").select("company_id"),
    supabase.from("customer_subscriptions").select("company_id, current_period_end, plan_id, subscription_plans(name)").order("current_period_end", { ascending: false }),
  ]);
  const memberCount = (id: string) => (members ?? []).filter((m) => m.company_id === id).length;
  const planOf = (id: string) => {
    const s = (subs ?? []).find((x) => x.company_id === id);
    const plan = s?.subscription_plans as { name: string } | { name: string }[] | null | undefined;
    const name = Array.isArray(plan) ? plan[0]?.name : plan?.name;
    return s ? `${name ?? "Plan"} until ${day(s.current_period_end)}` : "";
  };

  return (
    <>
      <PageHeader title="Companies" description={`${companies?.length ?? 0} shown`} />
      <form className="mb-6 flex gap-2" action="/admin">
        <label htmlFor="q" className="sr-only">
          Search companies
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Search by name"
          className="h-10 w-72 rounded-control border border-line-strong bg-surface px-3 type-small text-ink"
        />
        <button type="submit" className="h-10 rounded-control border border-line-strong px-4 type-small text-ink hover:bg-surface-2">
          Search
        </button>
      </form>
      <Panel>
        <Table caption="Companies">
          <THead>
            <tr>
              <Th>Company</Th>
              <Th>Status</Th>
              <Th>Plan</Th>
              <Th className="text-right">Users</Th>
              <Th>Signed up</Th>
            </tr>
          </THead>
          <TBody>
            {(companies ?? []).map((c) => (
              <Tr key={c.id}>
                <Td>
                  <Link href={`/admin/companies/${c.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                    {c.name}
                  </Link>
                  <span className="block type-caption text-ink-muted">{countryName(c.country_code)}</span>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status === "trial" ? `Trial to ${day(c.trial_ends_at)}` : c.status}</Badge>
                    {c.is_demo ? <Badge tone="warn">Demo</Badge> : null}
                  </div>
                </Td>
                <Td className="text-ink-muted">{planOf(c.id)}</Td>
                <Td numeric>{memberCount(c.id)}</Td>
                <Td className="text-ink-muted">{day(c.created_at)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Panel>
    </>
  );
}
