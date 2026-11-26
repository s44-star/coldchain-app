"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { Field, Input, describedBy } from "@/components/ui/form";
import type { FormState } from "@/lib/validation";
import { changePassword, updateProfile } from "./actions";

export function ProfileForm({ fullName, phone, email, emailAlerts }: { fullName: string; phone: string; email: string; emailAlerts: boolean }) {
  const [state, action] = useActionState(updateProfile, {} as FormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      <Field id="account-email" label="E-mail" hint="Used to sign in. Contact support to change it.">
        <Input id="account-email" value={email} readOnly disabled aria-describedby="account-email-hint" />
      </Field>
      <Field id="fullName" label="Full name" error={e.fullName}>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          defaultValue={state.values?.fullName ?? fullName}
          aria-invalid={!!e.fullName}
          aria-describedby={describedBy("fullName", null, e.fullName)}
        />
      </Field>
      <Field id="phone" label="Mobile number" hint="Optional. For SMS alerts once they are switched on." error={e.phone}>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={state.values?.phone ?? phone}
          aria-invalid={!!e.phone}
          aria-describedby={describedBy("phone", "hint", e.phone)}
        />
      </Field>
      <label className="flex items-start gap-3 type-small text-ink">
        <input type="checkbox" name="emailAlerts" defaultChecked={emailAlerts} className="mt-0.5 size-4 accent-[var(--primary)]" />
        <span>
          E-mail me when an alert is raised
          <span className="block type-caption text-ink-muted">Viewers never receive alert e-mails.</span>
        </span>
      </label>
      <div>
        <SubmitButton pendingLabel="Saving">Save details</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, {} as FormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      <Field id="password" label="New password" hint="At least 10 characters." error={e.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!e.password}
          aria-describedby={describedBy("password", "hint", e.password)}
        />
      </Field>
      <Field id="confirm" label="Repeat new password" error={e.confirm}>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!e.confirm}
          aria-describedby={describedBy("confirm", null, e.confirm)}
        />
      </Field>
      <div>
        <SubmitButton pendingLabel="Changing">Change password</SubmitButton>
      </div>
    </form>
  );
}
