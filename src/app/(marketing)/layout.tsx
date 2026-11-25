import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { CONTACT_EMAIL, demoMailto } from "@/lib/site";

const YEAR = new Date().getFullYear();

/** The marketing site is always dark, whatever theme the app uses. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="dark" data-surface="marketing" className="flex min-h-dvh flex-col bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-primary px-4 py-2 text-primary-ink focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        Skip to content
      </a>

      <header className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-6 px-6 py-6 md:px-10">
        <Link href="/" aria-label="ColdChain OS home" className="rounded-control">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <a href="#how-it-works" className="hidden rounded-control px-3 py-2 type-small text-ink-muted hover:text-ink sm:block">
            How it works
          </a>
          <a href="#contact" className="hidden rounded-control px-3 py-2 type-small text-ink-muted hover:text-ink sm:block">
            Contact
          </a>
          <a href={demoMailto} className={buttonClasses({ variant: "primary", size: "sm", className: "ml-2" })}>
            Book a demo
          </a>
        </nav>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between md:px-10">
          <Logo className="opacity-80" />
          <div className="grid gap-1 type-small text-ink-muted md:text-right">
            <p>
              ColdChain OS is built by LexConv.{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-primary">
                {CONTACT_EMAIL}
              </a>
            </p>
            <p>© {YEAR} LexConv</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
