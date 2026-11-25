import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr_auto] bg-canvas">
      <header className="mx-auto w-full max-w-md px-6 pt-8">
        <Link href="/" aria-label="ColdChain OS home" className="inline-block rounded-control">
          <Logo />
        </Link>
      </header>
      <main id="main" className="mx-auto grid w-full max-w-md content-start px-6 py-10 sm:content-center">
        {children}
      </main>
      <footer className="mx-auto w-full max-w-md px-6 pb-8 type-caption text-ink-subtle">
        Questions? ceo@lexconv.com
      </footer>
    </div>
  );
}
