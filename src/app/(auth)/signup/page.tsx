import type { Metadata } from "next";
import Link from "next/link";
import { safeNext } from "@/lib/validation";
import { SignupForm } from "../forms";

export const metadata: Metadata = { title: "Start your free trial" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const next = safeNext(params.next, "/onboarding");

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="type-h1 text-ink">Start your 14-day free trial</h1>
        <p className="type-body text-ink-muted">
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
      <SignupForm next={next} email={params.email} />
    </div>
  );
}
