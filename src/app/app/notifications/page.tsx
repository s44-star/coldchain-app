import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/form-parts";
import { SeverityBadge } from "@/components/status";
import { EmptyState } from "@/components/ui/empty-state";
import { getAppContext } from "@/lib/auth/context";
import { timeAgo } from "@/lib/monitoring";
import { cn } from "@/lib/utils";
import { markAllRead } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await getAppContext();
  const { data: items } = await ctx.supabase
    .from("notifications")
    .select("id, title, body, link, severity, read_at, created_at")
    .eq("user_id", ctx.userId)
    .eq("company_id", ctx.company.companyId)
    .order("created_at", { ascending: false })
    .limit(100);
  const unread = (items ?? []).filter((n) => !n.read_at).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You are up to date."}
        actions={
          unread ? (
            <ActionForm action={markAllRead} hidden={{}}>
              <SubmitButton size="sm" variant="secondary" pendingLabel="Marking">
                Mark all as read
              </SubmitButton>
            </ActionForm>
          ) : undefined
        }
      />
      {items?.length ? (
        <ul className="grid gap-2">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={n.link ?? "/app"}
                className={cn(
                  "flex flex-wrap items-start justify-between gap-3 rounded-panel border bg-surface p-4 hover:shadow-raise",
                  n.read_at ? "border-line" : "border-primary/40",
                )}
              >
                <div className="grid gap-0.5">
                  <p className={cn("type-small text-ink", !n.read_at && "font-semibold")}>{n.title}</p>
                  {n.body ? <p className="type-caption text-ink-muted">{n.body}</p> : null}
                  <p className="type-caption text-ink-subtle">{timeAgo(n.created_at)}</p>
                </div>
                <SeverityBadge value={n.severity} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No notifications yet">New alerts for your company appear here.</EmptyState>
      )}
    </>
  );
}
