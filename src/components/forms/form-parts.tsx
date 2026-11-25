"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type { FormState } from "@/lib/validation";

/** Submit button that shows progress while its form's action runs. */
export function SubmitButton({
  children,
  pendingLabel,
  variant,
  size,
  className,
}: {
  children: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} loading={pending} className={className}>
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}

/** Form-level error or confirmation from the last submission. */
export function FormMessage({ state }: { state: FormState }) {
  if (state.error) return <Callout tone="critical" title={state.error} />;
  if (state.message) return <Callout tone="ok" title={state.message} />;
  return null;
}
