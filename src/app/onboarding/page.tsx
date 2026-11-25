import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { getMemberships, requireUser } from "@/lib/auth/context";
import { OnboardingForm } from "./form";

export const metadata: Metadata = { title: "Set up your company" };

export default async function OnboardingPage() {
  await requireUser("/onboarding");
  if ((await getMemberships()).length > 0) redirect("/app");

  return (
    <main id="main" className="mx-auto grid min-h-dvh w-full max-w-md content-start gap-8 px-6 py-10 sm:content-center">
      <Logo />
      <div className="grid gap-2">
        <h1 className="type-h1 text-ink">Set up your company</h1>
        <p className="type-body text-ink-muted">
          Your 14-day free trial starts now. You can invite your team on the next screen.
        </p>
      </div>
      <OnboardingForm />
    </main>
  );
}
