import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-xl content-center gap-6 px-6 py-16">
      <Logo />
      <div className="grid gap-2">
        <h1 className="type-h1 text-ink">This page doesn’t exist</h1>
        <p className="type-body text-ink-muted">Check the address, or go back to the start.</p>
      </div>
      <div>
        <Link href="/" className={buttonClasses({ variant: "secondary" })}>
          Go to the home page
        </Link>
      </div>
    </main>
  );
}
