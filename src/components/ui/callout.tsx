import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AlertIcon, CheckIcon, ErrorIcon, InfoIcon } from "@/components/icons";

type CalloutTone = "info" | "ok" | "warn" | "critical";

const styles: Record<CalloutTone, { box: string; icon: ReactNode }> = {
  info: { box: "border-info/30 bg-info-soft", icon: <InfoIcon className="text-info" /> },
  ok: { box: "border-ok/30 bg-ok-soft", icon: <CheckIcon className="text-ok" /> },
  warn: { box: "border-warn/30 bg-warn-soft", icon: <AlertIcon className="text-warn" /> },
  critical: { box: "border-critical/30 bg-critical-soft", icon: <ErrorIcon className="text-critical" /> },
};

/** Inline message. Critical callouts are announced to screen readers. */
export function Callout({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: CalloutTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const s = styles[tone];
  return (
    <div
      role={tone === "critical" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-panel border p-4", s.box, className)}
    >
      <span className="mt-0.5 text-lg" aria-hidden="true">
        {s.icon}
      </span>
      <div className="grid flex-1 gap-1">
        <p className="type-small font-semibold text-ink">{title}</p>
        {children ? <div className="type-small text-ink-muted">{children}</div> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}
