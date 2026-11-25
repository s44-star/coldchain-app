import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("alert e-mail", () => {
  it("escapes content and links to the alert", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com");
    const { renderAlertEmail } = await import("@/lib/delivery");
    const { html, text } = renderAlertEmail("[Critical] Chiller <A> above 8 °C", "9 °C recorded\n\n/app/alerts/123");
    expect(html).toContain("Chiller &lt;A&gt;");
    expect(html).not.toContain("<A>");
    expect(html).toContain('href="https://app.example.com/app/alerts/123"');
    expect(text).toContain("Open the alert: https://app.example.com/app/alerts/123");
    vi.unstubAllEnvs();
  });

  it("never links outside the app", async () => {
    const { renderAlertEmail } = await import("@/lib/delivery");
    expect(renderAlertEmail("x", "msg\n\nhttps://evil.example").text).not.toContain("evil.example");
  });
});
