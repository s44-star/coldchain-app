import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { ACTIVITY_TYPES, describeActivity, type AuditRow } from "@/lib/activity";
import { formatDateTime } from "@/lib/format";

export const ACTIVITY_PAGE_SIZE = 50;

/** Filter by type, newest first, "Older" pages by id. Shared by app and admin. */
export function ActivityTable({
  rows,
  basePath,
  type,
  companyNames,
}: {
  rows: AuditRow[];
  basePath: string;
  type: string;
  companyNames?: Map<string, string>;
}) {
  const last = rows.at(-1);
  const olderHref =
    rows.length === ACTIVITY_PAGE_SIZE && last
      ? `${basePath}?${new URLSearchParams({ ...(type ? { type } : {}), before: String(last.id) })}`
      : null;

  return (
    <div className="grid gap-4">
      <form action={basePath} className="flex flex-wrap items-center gap-2">
        <label htmlFor="type" className="type-small text-ink">
          Show
        </label>
        <select
          id="type"
          name="type"
          defaultValue={type}
          className="h-10 rounded-control border border-line-strong bg-surface px-2 type-small text-ink"
        >
          <option value="">Everything</option>
          {ACTIVITY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-control border border-line-strong px-4 type-small text-ink hover:bg-surface-2">
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No activity yet">Changes to warehouses, sensors, the team and settings appear here.</EmptyState>
      ) : (
        <Panel>
          <Table caption="Activity">
            <THead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                {companyNames ? <Th>Company</Th> : null}
                <Th>What happened</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => {
                const { what, details } = describeActivity(row);
                return (
                  <Tr key={row.id}>
                    <Td className="whitespace-nowrap text-ink-muted">{formatDateTime(row.created_at)}</Td>
                    <Td className="max-w-48 break-words">{row.actor_email ?? <span className="text-ink-muted">System</span>}</Td>
                    {companyNames ? (
                      <Td className="max-w-48 break-words">
                        {row.company_id ? (
                          <Link href={`/admin/companies/${row.company_id}`} className="text-primary underline-offset-4 hover:underline">
                            {companyNames.get(row.company_id) ?? "Deleted company"}
                          </Link>
                        ) : (
                          <span className="text-ink-muted">Platform</span>
                        )}
                      </Td>
                    ) : null}
                    <Td className="min-w-64">
                      <span className="text-ink">{what}</span>
                      {details ? <span className="block type-caption text-ink-muted">{details}</span> : null}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </Panel>
      )}

      {olderHref ? (
        <div>
          <Link href={olderHref} className="type-small text-primary underline underline-offset-4">
            Show older activity
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/** Parses ?type=&before= into safe query values. */
export function parseActivityParams(params: { type?: string; before?: string }): { type: string; before: number | null } {
  const type = ACTIVITY_TYPES.some((t) => t.value === params.type) ? (params.type as string) : "";
  const before = Number.parseInt(params.before ?? "", 10);
  return { type, before: Number.isSafeInteger(before) && before > 0 ? before : null };
}
