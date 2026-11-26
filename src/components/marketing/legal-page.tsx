import type { ReactNode } from "react";

/** Long-form legal text with a readable measure. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-[44rem] px-6 pt-8 pb-24 md:px-10">
      <h1 className="type-title text-ink">{title}</h1>
      <p className="mt-3 type-small text-ink-muted">Last updated {updated}</p>
      <div className="legal mt-10 grid gap-5 type-body text-ink-muted [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-6 [&_h2]:type-h2 [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink [&_ul]:grid [&_ul]:gap-2">
        {children}
      </div>
    </article>
  );
}
