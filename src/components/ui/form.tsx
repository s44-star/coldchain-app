import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-control border border-line-strong bg-surface text-sm text-ink placeholder:text-ink-subtle " +
  "transition-colors hover:border-ink-subtle focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 " +
  "focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-muted " +
  "aria-invalid:border-critical aria-invalid:focus-visible:outline-critical";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-10 px-3", className)} {...props} />;
}

export function Textarea({ className, rows = 4, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cn(control, "min-h-20 px-3 py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(control, "h-10 appearance-none pr-9 pl-3", className)} {...props}>
        {children}
      </select>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

type FieldProps = {
  /** id of the control inside; wires the label, hint and error to it. */
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * Label + control + hint/error. Give the control
 * `aria-describedby={describedBy(id, hint, error)}` and `aria-invalid={!!error}`.
 */
export function Field({ id, label, hint, error, required, children, className }: FieldProps) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className="type-small font-medium text-ink">
        {label}
        {required ? (
          <span className="ml-1 text-ink-muted" aria-hidden="true">
            (required)
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="type-small text-critical" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="type-small text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, hint?: ReactNode, error?: string | null): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}
