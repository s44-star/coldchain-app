"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getPublicEnv } from "@/lib/env";
import { clientIp, rateLimit, siteOrigin } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import {
  emailSchema,
  fieldErrors,
  formValues,
  fullNameSchema,
  passwordSchema,
  safeNext,
  type FormState,
} from "@/lib/validation";

const NOT_CONFIGURED: FormState = { error: "Sign-in is not available yet. Try again in a few minutes." };
const TOO_MANY: FormState = { error: "Too many attempts. Wait 15 minutes and try again." };

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!getPublicEnv()) return NOT_CONFIGURED;
  const values = formValues(formData, ["email"]);
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1, "Enter your password") })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const ip = await clientIp();
  const allowed =
    (await rateLimit(`login:ip:${ip}`, 30, 900)) && (await rateLimit(`login:email:${parsed.data.email}`, 10, 900));
  if (!allowed) return { ...TOO_MANY, values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Confirm your e-mail address first: open the link we sent you.", values };
    }
    return { error: "E-mail or password is incorrect.", values };
  }

  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!getPublicEnv()) return NOT_CONFIGURED;
  const values = formValues(formData, ["fullName", "email"]);
  const parsed = z
    .object({ fullName: fullNameSchema, email: emailSchema, password: passwordSchema })
    .safeParse({
      fullName: formData.get("fullName"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  if (!(await rateLimit(`signup:ip:${await clientIp()}`, 10, 3600))) return { ...TOO_MANY, values };

  const next = safeNext(formData.get("next"), "/onboarding");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    if (error.code === "weak_password") return { fieldErrors: { password: error.message }, values };
    console.error("signUp failed", error.code, error.message);
    return { error: "We could not create your account. Check the details and try again.", values };
  }

  // E-mail confirmation off: the user is signed in straight away.
  if (data.session) redirect(next);

  return {
    ok: true,
    message: `Check ${parsed.data.email} for a confirmation link. Open it on this device to continue.`,
  };
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!getPublicEnv()) return NOT_CONFIGURED;
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0]?.message ?? "Invalid" } };

  if (!(await rateLimit(`reset:ip:${await clientIp()}`, 5, 3600))) return TOO_MANY;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/reset-password`,
  });
  if (error) console.error("resetPasswordForEmail failed", error.code, error.message);

  // Same answer whether or not the account exists.
  return { ok: true, message: `If ${parsed.data} has an account, a reset link is on its way.` };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!getPublicEnv()) return NOT_CONFIGURED;
  const parsed = passwordSchema.safeParse(formData.get("password"));
  if (!parsed.success) return { fieldErrors: { password: parsed.error.issues[0]?.message ?? "Invalid" } };
  if (formData.get("password") !== formData.get("confirm")) {
    return { fieldErrors: { confirm: "The passwords do not match" } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    if (error.code === "same_password") return { fieldErrors: { password: "Choose a password you have not used here" } };
    return { error: "Your reset link has expired. Request a new one." };
  }
  redirect("/app");
}

export async function signOut(): Promise<void> {
  if (getPublicEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
