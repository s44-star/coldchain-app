"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; exact?: boolean; disabled?: boolean };

/**
 * App navigation. Runs in the browser so the highlighted item follows every
 * client-side navigation (the layout itself does not re-render between pages).
 */
export function AppNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const isActive = (item: NavItem) =>
    item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);

  return (
    <nav aria-label="App" className="overflow-x-auto px-3 pb-3">
      <ul className="flex gap-1 lg:grid">
        {items.map((item) => {
          if (item.disabled) {
            return (
              <li key={item.href}>
                <span className="block rounded-control px-3 py-2 type-small whitespace-nowrap text-ink-subtle">{item.label}</span>
              </li>
            );
          }
          const active = isActive(item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-control px-3 py-2 type-small whitespace-nowrap transition-colors",
                  active ? "bg-primary-soft font-medium text-primary" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
