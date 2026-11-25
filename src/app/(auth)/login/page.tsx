import type { Metadata } from "next";
import Link from "next/link";
import { Callout } from "@/components/ui/callout";
import { safeNext } from "@/lib/validation";
import { LoginForm } from "../forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const next = safeNext(params.next);

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="type-h1 text-ink">Sign in to ColdChain OS</h1>
        <p className="type-body text-ink-muted">
          New here?{" "}
          <Link href={`/signup${next !== "/app" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-primary underline-offset-4 hover:underline">
            Start a free trial
          </Link>
        </p>
      </div>
      {params.error === "link" ? (
        <Callout tone="warn" title="That link has expired or was already used">
          Sign in below, or request a new link.
        </Callout>
      ) : null}
      <LoginForm next={next} />
    </div>
  );
}
