import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { roleLabels } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Users" };

const LIMIT = 300;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { supabase } = await requirePlatformAdmin();

  let query = supabase
    .from("profiles")
    .select("id, email, full_name, created_at")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  const term = q.trim().replace(/[%_,()]/g, "");
  if (term) query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  const { data: users } = await query;

  const ids = (users ?? []).map((u) => u.id);
  const [{ data: memberships }, { data: admins }] = ids.length
    ? await Promise.all([
        supabase.from("company_members").select("user_id, role, company_id, companies(name)").in("user_id", ids),
        supabase.from("platform_admins").select("user_id").in("user_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const adminIds = new Set((admins ?? []).map((a) => a.user_id));

  return (
    <>
      <PageHeader title="Users" description={`${users?.length ?? 0} shown${users?.length === LIMIT ? `, newest ${LIMIT}` : ""}`} />
      <form className="mb-6 flex gap-2" action="/admin/users">
        <label htmlFor="q" className="sr-only">
          Search users
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Search by e-mail or name"
          className="h-10 w-72 max-w-full rounded-control border border-line-strong bg-surface px-3 type-small text-ink"
        />
        <button type="submit" className="h-10 rounded-control border border-line-strong px-4 type-small text-ink hover:bg-surface-2">
          Search
        </button>
      </form>
      <Panel>
        <Table caption="Users">
          <THead>
            <tr>
              <Th>User</Th>
              <Th>Companies</Th>
              <Th>Signed up</Th>
            </tr>
          </THead>
          <TBody>
            {(users ?? []).map((u) => {
              const mine = (memberships ?? []).filter((m) => m.user_id === u.id);
              return (
                <Tr key={u.id}>
                  <Td className="min-w-56">
                    <span className="block text-ink">{u.full_name || "No name"}</span>
                    <span className="block type-caption text-ink-muted break-all">{u.email}</span>
                    {adminIds.has(u.id) ? (
                      <Badge tone="critical" className="mt-1">
                        Super admin
                      </Badge>
                    ) : null}
                  </Td>
                  <Td className="min-w-56">
                    {mine.length === 0 ? (
                      <span className="text-ink-muted">None</span>
                    ) : (
                      <ul className="grid gap-1">
                        {mine.map((m) => {
                          const company = m.companies as { name: string } | { name: string }[] | null;
                          const name = Array.isArray(company) ? company[0]?.name : company?.name;
                          return (
                            <li key={m.company_id}>
                              <Link href={`/admin/companies/${m.company_id}`} className="text-primary underline-offset-4 hover:underline">
                                {name ?? "Company"}
                              </Link>{" "}
                              <span className="text-ink-muted">· {roleLabels[m.role]}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-muted">{formatDateTime(u.created_at).split(",")[0]}</Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Panel>
    </>
  );
}
