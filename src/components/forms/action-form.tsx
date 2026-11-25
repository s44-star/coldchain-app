"use client";

import { useActionState, type ReactNode } from "react";
import type { FormState } from "@/lib/validation";
import { cn } from "@/lib/utils";

/**
 * Small inline form for row actions (change role, remove, revoke). Shows the
 * action's error next to the control instead of failing silently.
 */
export function ActionForm({
  action,
  hidden,
  children,
  className,
  confirm,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  children: ReactNode;
  className?: string;
  /** Ask before submitting, e.g. for removals. */
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, {} as FormState);
  return (
    <form
      action={formAction}
      className={cn("flex flex-wrap items-center gap-2", className)}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      {state.error ? (
        <p role="alert" className="w-full type-caption text-critical">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
