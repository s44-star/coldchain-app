"use client";

import { useState } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "@/components/icons";
import { THEME_COOKIE, nextTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const labels: Record<Theme, string> = { light: "Light", dark: "Dark", system: "System" };
const icons: Record<Theme, typeof SunIcon> = { light: SunIcon, dark: MoonIcon, system: MonitorIcon };

/**
 * Cycles Light → Dark → System. The choice is stored in a cookie so the
 * server renders the right theme on the next request (no flash, no inline
 * script needed under the strict CSP).
 */
export function ThemeToggle({ initial, className }: { initial: Theme; className?: string }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const Icon = icons[theme];
  const upcoming = nextTheme(theme);

  function cycle() {
    setTheme(upcoming);
    document.documentElement.dataset.theme = upcoming;
    document.cookie = `${THEME_COOKIE}=${upcoming}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-control border border-line px-3 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink",
        className,
      )}
      aria-label={`Theme: ${labels[theme]}. Switch to ${labels[upcoming]}.`}
    >
      <Icon className="text-base" />
      <span>{labels[theme]}</span>
    </button>
  );
}
