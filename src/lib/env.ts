import { z } from "zod";

/**
 * Environment variables, validated lazily so a missing value never breaks the
 * build. Public values are referenced literally (process.env.NEXT_PUBLIC_…)
 * because Next.js inlines them into browser bundles only in that form.
 */

const publicSchema = z.object({
  supabaseUrl: z.url({ protocol: /^https?$/ }),
  supabasePublishableKey: z.string().min(20),
  siteUrl: z.url().optional(),
});

const serverSchema = z.object({
  supabaseSecretKey: z.string().min(20),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = PublicEnv & z.infer<typeof serverSchema>;

function readPublic() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  };
}

/** Public config, or null when Supabase is not configured yet. */
export function getPublicEnv(): PublicEnv | null {
  const parsed = publicSchema.safeParse(readPublic());
  return parsed.success ? parsed.data : null;
}

export function requirePublicEnv(): PublicEnv {
  const parsed = publicSchema.safeParse(readPublic());
  if (!parsed.success) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return parsed.data;
}

/** Server-only config (secret key). Never import the result into client code. */
export function requireServerEnv(): ServerEnv {
  const pub = requirePublicEnv();
  const parsed = serverSchema.safeParse({ supabaseSecretKey: process.env.SUPABASE_SECRET_KEY });
  if (!parsed.success) {
    throw new Error("Server is not configured: set SUPABASE_SECRET_KEY.");
  }
  return { ...pub, ...parsed.data };
}

export function isServerEnvConfigured(): boolean {
  return getPublicEnv() !== null && serverSchema.safeParse({ supabaseSecretKey: process.env.SUPABASE_SECRET_KEY }).success;
}
