import { Skeleton, Spinner } from "@/components/ui/spinner";

/** Shown instantly while the next page loads, so taps always get feedback. */
export default function Loading() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <div className="flex items-center gap-2 type-small text-ink-muted">
        <Spinner className="size-4" label="Loading" /> Loading
      </div>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
