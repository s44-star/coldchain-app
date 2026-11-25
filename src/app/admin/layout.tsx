import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { requirePlatformAdmin } from "@/lib/auth/admin";

export const metadata: Metadata = { title: { default: "Super admin", template: "%s | Super admin" }, robots: { index: false } };

const NAV = [
  { href: "/admin", label: "Companies" },
  { href: "/admin/plans", label: "Plans and prices" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/app", label: "Back to the app" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requirePlatformAdmin();
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <Logo />
            <Badge tone="critical">Super admin</Badge>
          </div>
          <p className="type-caption text-ink-muted">{session.email}</p>
        </div>
        <nav aria-label="Admin" className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-3 pb-3">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-control px-3 py-2 type-small whitespace-nowrap text-ink-muted hover:bg-surface-2 hover:text-ink">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl px-5 py-8">
        {children}
      </main>
    </div>
  );
}
