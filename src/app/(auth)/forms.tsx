"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { Field, Input, describedBy } from "@/components/ui/form";
import type { FormState } from "@/lib/validation";
import { requestPasswordReset, signIn, signUp, updatePassword } from "./actions";

const initial: FormState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, initial);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next ?? "/app"} />
      <Field id="email" label="Work e-mail" error={e.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.values?.email}
          aria-invalid={!!e.email}
          aria-describedby={describedBy("email", null, e.email)}
        />
      </Field>
      <Field id="password" label="Password" error={e.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={!!e.password}
          aria-describedby={describedBy("password", null, e.password)}
        />
      </Field>
      <SubmitButton pendingLabel="Signing in" size="lg">
        Sign in
      </SubmitButton>
      <Link href="/forgot-password" className="justify-self-start type-small text-primary underline-offset-4 hover:underline">
        Forgot your password?
      </Link>
    </form>
  );
}

export function SignupForm({ next, email }: { next?: string; email?: string }) {
  const [state, action] = useActionState(signUp, initial);
  const e = state.fieldErrors ?? {};
  if (state.ok && state.message) return <FormMessage state={state} />;
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next ?? "/onboarding"} />
      <Field id="fullName" label="Full name" error={e.fullName}>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          defaultValue={state.values?.fullName}
          aria-invalid={!!e.fullName}
          aria-describedby={describedBy("fullName", null, e.fullName)}
        />
      </Field>
      <Field id="email" label="Work e-mail" error={e.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.values?.email ?? email}
          aria-invalid={!!e.email}
          aria-describedby={describedBy("email", null, e.email)}
        />
      </Field>
      <Field id="password" label="Password" hint="At least 10 characters." error={e.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          aria-invalid={!!e.password}
          aria-describedby={describedBy("password", "hint", e.password)}
        />
      </Field>
      <SubmitButton pendingLabel="Creating account" size="lg">
        Create account
      </SubmitButton>
      <p className="type-caption text-ink-muted">
        14-day free trial. No card needed until you choose a plan.
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, initial);
  const e = state.fieldErrors ?? {};
  if (state.ok && state.message) return <FormMessage state={state} />;
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      <Field id="email" label="Work e-mail" error={e.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          aria-invalid={!!e.email}
          aria-describedby={describedBy("email", null, e.email)}
        />
      </Field>
      <SubmitButton pendingLabel="Sending" size="lg">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, initial);
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
          required
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
          required
          aria-invalid={!!e.confirm}
          aria-describedby={describedBy("confirm", null, e.confirm)}
        />
      </Field>
      <SubmitButton pendingLabel="Saving" size="lg">
        Save new password
      </SubmitButton>
    </form>
  );
}
