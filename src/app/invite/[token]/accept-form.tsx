"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms/form-parts";
import type { FormState } from "@/lib/validation";
import { acceptInvitation } from "./actions";

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInvitation, {} as FormState);
  return (
    <form action={action} className="grid gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingLabel="Joining" size="lg">
        Accept invitation
      </SubmitButton>
    </form>
  );
}
