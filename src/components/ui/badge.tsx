import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "primary" | "ok" | "warn" | "critical" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-muted",
  primary: "bg-primary-soft text-primary",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  critical: "bg-critical-soft text-critical",
  info: "bg-info-soft text-info",
};

const dots: Record<Tone, string> = {
  neutral: "bg-ink-subtle",
  primary: "bg-primary",
  ok: "bg-ok",
  warn: "bg-warn",
  critical: "bg-critical",
  info: "bg-info",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden="true" className={cn("size-1.5 rounded-full", dots[tone])} /> : null}
      {children}
    </span>
  );
}

/**
 * Shown permanently wherever simulated readings appear, so demo data can never
 * be mistaken for real measurements.
 */
export function SimulatedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-control border border-dashed border-warn px-2 py-0.5 text-xs font-semibold text-warn",
        className,
      )}
      title="Readings on this page are generated for demonstration and do not come from real sensors."
    >
      Simulated data
    </span>
  );
}
