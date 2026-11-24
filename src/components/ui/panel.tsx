import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Bordered surface for grouping related content inside the app. */
export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-panel border border-line bg-surface", className)} {...props} />;
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="grid gap-0.5">
        <h2 className="type-h3 text-ink">{title}</h2>
        {description ? <p className="type-small text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PanelBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}
