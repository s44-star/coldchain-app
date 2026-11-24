"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Generic error boundary: no internals shown, a reference for support. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-xl content-center gap-6 px-6 py-16">
      <div className="grid gap-2">
        <h1 className="type-h1 text-ink">Something went wrong on our side</h1>
        <p className="type-body text-ink-muted">
          Try again. If it keeps happening, e-mail ceo@lexconv.com
          {error.digest ? (
            <>
              {" "}
              and quote reference <span className="tabular text-ink">{error.digest}</span>
            </>
          ) : null}
          .
        </p>
      </div>
      <div>
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
