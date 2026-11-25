import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/context";
import { ResetPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  // The reset link signs the user in through /auth/callback first.
  await requireUser("/reset-password");
  return (
    <div className="grid gap-8">
      <h1 className="type-h1 text-ink">Choose a new password</h1>
      <ResetPasswordForm />
    </div>
  );
}
