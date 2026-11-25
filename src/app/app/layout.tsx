import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "@/app/(auth)/actions";
import { switchCompany } from "./company-switch/actions";
import { AppNav } from "@/components/app/app-nav";
import { Logo } from "@/components/brand/logo";
import { roleLabels } from "@/components/status";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { can } from "@/lib/auth/roles";
import { currentPath, getAppContext } from "@/lib/auth/context";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview", robots: { index: false } };

const NAV = [
  { href: "/app", label: "Overview", exact: true },
  { href: "/app/alerts", label: "Alerts" },
  { href: "/app/incidents", label: "Incidents" },
  { href: "/app/warehouses", label: "Warehouses" },
  { href: "/app/maintenance", label: "Maintenance" },
  { href: "/app/reports", label: "Reports" },
  { href: "/app/notifications", label: "Notifications" },
  { href: "/app/settings/team", label: "Team" },
  { href: "/app/settings/company", label: "Company" },
  { href: "/app/billing", label: "Billing", ownerOnly: true },
  { href: "/app/settings/account", label: "Your account" },
];

function daysLeft(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getAppContext();
  const path = await currentPath();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  // Paywall: once the trial or paid period has ended, only billing (and the
  // account page, to sign out or change password) stays reachable.
  const lockedOut = ctx.access.state === "locked";
  const allowedWhenLocked = path.startsWith("/app/billing") || path.startsWith("/app/settings/account");
  if (lockedOut && !allowedWhenLocked) redirect("/app/billing");

  const { count: unread } = await ctx.supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.userId)
    .eq("company_id", ctx.company.companyId)
    .is("read_at", null);

  const nav = NAV.filter((item) => !item.ownerOnly || can.manageBilling(ctx.role)).map((item) => ({
    href: item.href,
    label: item.href === "/app/notifications" && unread ? `${item.label} (${unread})` : item.label,
    exact: item.exact,
    disabled: lockedOut && !(item.href.startsWith("/app/billing") || item.href.startsWith("/app/settings/account")),
  }));
  const remaining = daysLeft(ctx.access.endsAt);

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="border-b border-line bg-surface print:hidden lg:sticky lg:top-0 lg:h-dvh lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-5 py-4 lg:py-6">
          <Link href="/app" aria-label="Overview" className="rounded-control">
            <Logo />
          </Link>
          <form action={signOut} className="lg:hidden">
            <button type="submit" className="rounded-control px-2 py-1 type-small text-ink-muted hover:text-ink">
              Sign out
            </button>
          </form>
        </div>

        <div className="px-5 pb-3 lg:pb-4">
          {ctx.memberships.length > 1 ? (
            <form action={switchCompany} className="flex items-center gap-2">
              <label htmlFor="company-switch" className="sr-only">
                Company
              </label>
              <select
                id="company-switch"
                name="companyId"
                defaultValue={ctx.company.companyId}
                className="h-9 min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-2 type-small text-ink"
              >
                {ctx.memberships.map((m) => (
                  <option key={m.companyId} value={m.companyId}>
                    {m.companyName}
                  </option>
                ))}
              </select>
              <button type="submit" className="h-9 rounded-control border border-line-strong px-3 type-small text-ink hover:bg-surface-2">
                Switch
              </button>
            </form>
          ) : (
            <p className="hidden type-small font-semibold text-ink lg:block">{ctx.company.companyName}</p>
          )}
          <p className="hidden type-caption text-ink-muted lg:block">{roleLabels[ctx.role]}</p>
        </div>

        <AppNav items={nav} />

        <div className="hidden gap-3 border-t border-line px-5 py-4 lg:absolute lg:inset-x-0 lg:bottom-0 lg:grid">
          <p className="truncate type-caption text-ink-muted" title={ctx.email}>
            {ctx.email}
          </p>
          <div className="flex items-center gap-2">
            <ThemeToggle initial={theme} />
            <form action={signOut}>
              <button type="submit" className="h-9 rounded-control px-3 type-small text-ink-muted hover:bg-surface-2 hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {ctx.access.state === "trial" ? (
          <AccessBanner tone="info">
            Free trial: {remaining} {remaining === 1 ? "day" : "days"} left.{" "}
            {can.manageBilling(ctx.role) ? (
              <Link href="/app/billing" className="font-medium underline underline-offset-4">
                Choose a plan
              </Link>
            ) : (
              "Your company owner can choose a plan."
            )}
          </AccessBanner>
        ) : ctx.access.state === "grace" ? (
          <AccessBanner tone="warn">
            Your subscription has ended. Access stops in {remaining} {remaining === 1 ? "day" : "days"}.{" "}
            {can.manageBilling(ctx.role) ? (
              <Link href="/app/billing" className="font-medium underline underline-offset-4">
                Renew now
              </Link>
            ) : (
              "Ask your company owner to renew."
            )}
          </AccessBanner>
        ) : null}
        <main id="main" className="mx-auto w-full max-w-5xl min-w-0 px-5 py-8 md:px-8 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

function AccessBanner({ tone, children }: { tone: "info" | "warn"; children: ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        "border-b px-5 py-2.5 type-small md:px-8 print:hidden",
        tone === "info" ? "border-info/20 bg-info-soft text-ink" : "border-warn/30 bg-warn-soft text-ink",
      )}
    >
      {children}
    </div>
  );
}
