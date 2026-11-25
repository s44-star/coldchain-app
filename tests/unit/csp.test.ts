import { describe, expect, it } from "vitest";
import { buildCsp, createNonce } from "@/lib/security/csp";

function directive(csp: string, name: string): string[] {
  const entry = csp.split("; ").find((d) => d.startsWith(`${name} `));
  return entry ? entry.split(" ").slice(1) : [];
}

describe("buildCsp", () => {
  it("allows scripts only by nonce, with strict-dynamic", () => {
    const csp = buildCsp({ nonce: "abc123" });
    const scripts = directive(csp, "script-src");
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("adds unsafe-eval only in development", () => {
    expect(directive(buildCsp({ nonce: "n", isDev: true }), "script-src")).toContain("'unsafe-eval'");
  });

  it("forbids framing and plugins", () => {
    const csp = buildCsp({ nonce: "n" });
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
  });

  it("pins Supabase to the configured project", () => {
    const csp = buildCsp({ nonce: "n", supabaseUrl: "https://abcd.supabase.co" });
    expect(directive(csp, "connect-src")).toEqual(
      expect.arrayContaining(["https://abcd.supabase.co", "wss://abcd.supabase.co"]),
    );
    expect(csp).not.toContain("*.supabase.co");
  });

  it("falls back to the Supabase wildcard when unconfigured", () => {
    expect(directive(buildCsp({ nonce: "n" }), "connect-src")).toContain("https://*.supabase.co");
  });
});

describe("createNonce", () => {
  it("returns distinct base64 values of 128 bits", () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
