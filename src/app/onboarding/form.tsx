"use client";

import { useActionState } from "react";
import { CompanyIdentityFields } from "@/components/forms/company-fields";
import { FormMessage, SubmitButton } from "@/components/forms/form-parts";
import type { FormState } from "@/lib/validation";
import { createCompany } from "./actions";

export function OnboardingForm() {
  const [state, action] = useActionState(createCompany, {} as FormState);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      <CompanyIdentityFields values={state.values} errors={state.fieldErrors ?? {}} />
      <SubmitButton pendingLabel="Creating company" size="lg">
        Create company
      </SubmitButton>
    </form>
  );
}
