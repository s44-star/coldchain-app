import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicEnv, isServerEnvConfigured, requirePublicEnv, requireServerEnv } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("env", () => {
  it("returns null instead of throwing when Supabase is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(getPublicEnv()).toBeNull();
    expect(() => requirePublicEnv()).toThrow(/not configured/);
  });

  it("parses valid public configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_0123456789abcdef");
    expect(getPublicEnv()).toMatchObject({ supabaseUrl: "https://abcd.supabase.co" });
  });

  it("rejects a non-URL Supabase address", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "abcd.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_0123456789abcdef");
    expect(getPublicEnv()).toBeNull();
  });

  it("requires the secret key for server configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_0123456789abcdef");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(isServerEnvConfigured()).toBe(false);
    expect(() => requireServerEnv()).toThrow(/SUPABASE_SECRET_KEY/);

    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_0123456789abcdefghij");
    expect(isServerEnvConfigured()).toBe(true);
    expect(requireServerEnv().supabaseSecretKey).toBe("sb_secret_0123456789abcdefghij");
  });
});
