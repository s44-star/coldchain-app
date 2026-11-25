import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="type-h1 text-ink">Reset your password</h1>
        <p className="type-body text-ink-muted">We will e-mail you a link to choose a new one.</p>
      </div>
      <ForgotPasswordForm />
      <Link href="/login" className="type-small text-primary underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
