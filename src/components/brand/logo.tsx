import { cn } from "@/lib/utils";

/** Mark: a reading crossing its tolerance band. Wordmark set wide. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden="true" fill="none">
      <rect x="1" y="1" width="30" height="30" rx="8" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M5 11.5h22M5 20.5h22" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="2 2.5" />
      <path
        d="M5 17c2.2 0 2.6-2.4 4.6-2.4S12.2 17 14.4 17s2.2-9 4.6-9 2.4 8 4.4 8 2.4-1.6 3.6-1.6"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-ink", className)}>
      <LogoMark />
      <span className="text-[1.0625rem] leading-none font-medium tracking-[-0.01em] [font-stretch:125%]">
        ColdChain OS
      </span>
    </span>
  );
}
