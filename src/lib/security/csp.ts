/**
 * Content-Security-Policy with a per-request nonce. Next.js reads the nonce
 * from this header and applies it to its own scripts; with 'strict-dynamic'
 * only nonce-bearing scripts (and what they load) may run.
 */

export type CspOptions = {
  nonce: string;
  supabaseUrl?: string | null;
  isDev?: boolean;
};

const RAZORPAY = {
  script: "https://checkout.razorpay.com",
  api: "https://api.razorpay.com",
  telemetry: "https://lumberjack.razorpay.com",
};

function supabaseOrigins(supabaseUrl?: string | null): { http: string; ws: string } {
  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      const wsProtocol = url.protocol === "http:" ? "ws:" : "wss:";
      return { http: url.origin, ws: `${wsProtocol}//${url.host}` };
    } catch {
      // fall through to the wildcard
    }
  }
  return { http: "https://*.supabase.co", ws: "wss://*.supabase.co" };
}

export function buildCsp({ nonce, supabaseUrl, isDev = false }: CspOptions): string {
  const supabase = supabaseOrigins(supabaseUrl);

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      RAZORPAY.script,
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    // React style attributes need inline styles; scripts stay nonce-only.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "blob:", "data:", supabase.http],
    "font-src": ["'self'"],
    "connect-src": ["'self'", supabase.http, supabase.ws, RAZORPAY.api, RAZORPAY.telemetry],
    "frame-src": [RAZORPAY.api, RAZORPAY.script],
    "worker-src": ["'self'", "blob:"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  };

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/** 128-bit random nonce, base64-encoded. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
