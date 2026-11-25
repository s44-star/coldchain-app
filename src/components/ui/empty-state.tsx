import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** An empty screen says what belongs here and how to add it. */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-panel border border-dashed border-line-strong px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-xl text-ink-muted" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <h3 className="type-h3 text-ink">{title}</h3>
      {children ? <div className="max-w-sm type-small text-ink-muted">{children}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
