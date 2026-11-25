"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { roleLabels } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, describedBy } from "@/components/ui/form";
import { ASSIGNABLE_ROLES, ROLE_DESCRIPTIONS } from "@/lib/auth/roles";
import type { FormState } from "@/lib/validation";
import { inviteMember } from "./actions";

export function InviteForm() {
  const [state, action] = useActionState(inviteMember, {} as FormState);
  const e = state.fieldErrors ?? {};

  return (
    <div className="grid gap-5">
      <form action={action} className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-start" noValidate>
        <Field id="invite-email" label="E-mail" error={e.email}>
          <Input
            id="invite-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            required
            defaultValue={state.ok ? "" : state.values?.email}
            aria-invalid={!!e.email}
            aria-describedby={describedBy("invite-email", null, e.email)}
          />
        </Field>
        <Field id="invite-role" label="Role" error={e.role}>
          <Select id="invite-role" name="role" defaultValue={state.values?.role || "operator"}>
            {ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="md:pt-[1.625rem]">
          <SubmitButton pendingLabel="Creating link">Create invitation</SubmitButton>
        </div>
      </form>
      {state.error ? <FormMessage state={state} /> : null}
      {state.ok && state.data?.link ? <InviteLink message={state.message ?? ""} link={state.data.link} /> : null}
      <details className="type-small text-ink-muted">
        <summary className="cursor-pointer text-ink">What each role can do</summary>
        <dl className="mt-3 grid gap-2">
          {ASSIGNABLE_ROLES.map((role) => (
            <div key={role} className="grid gap-0.5 sm:grid-cols-[160px_1fr]">
              <dt className="font-medium text-ink">{roleLabels[role]}</dt>
              <dd>{ROLE_DESCRIPTIONS[role]}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

function InviteLink({ message, link }: { message: string; link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="grid gap-3 rounded-panel border border-ok/30 bg-ok-soft p-4">
      <p className="type-small font-semibold text-ink">{message}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input readOnly value={link} aria-label="Invitation link" className="min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      <p className="type-caption text-ink-muted">Send it on WhatsApp or e-mail. The link is shown only once.</p>
    </div>
  );
}
