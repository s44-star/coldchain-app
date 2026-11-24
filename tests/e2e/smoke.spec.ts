import { expect, test, type Page } from "@playwright/test";

/** Collect console errors and CSP violations while a page loads. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("landing page", () => {
  test("renders under the strict CSP without errors", async ({ page }) => {
    const errors = watchErrors(page);
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { level: 1, name: "Every degree, on record." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Book a demo" }).first()).toHaveAttribute(
      "href",
      /^mailto:ceo@lexconv\.com/,
    );
    await expect(page.locator("figure figcaption")).toContainText("Illustration");

    // Hydration finished = Next.js scripts ran, so the nonce was accepted.
    await page.waitForLoadState("networkidle");
    expect(errors.filter((e) => /Content Security Policy|Refused to/i.test(e))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("every script carries the request nonce", async ({ page }) => {
    const response = await page.goto("/");
    const csp = response?.headers()["content-security-policy"] ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce, "CSP header must contain a nonce").toBeTruthy();

    const scripts = await page.locator("script").evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLScriptElement).nonce),
    );
    expect(scripts.length).toBeGreaterThan(0);
    for (const value of scripts) expect(value).toBe(nonce);
  });

  test("sends security headers", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("uses a fresh nonce per request", async ({ request }) => {
    const a = (await request.get("/")).headers()["content-security-policy"];
    const b = (await request.get("/")).headers()["content-security-policy"];
    expect(a).not.toEqual(b);
  });
});

test.describe("design system", () => {
  test("renders and switches theme", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/design-system");
    await expect(page.getByRole("heading", { level: 1, name: "Glacier design system" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.getByRole("button", { name: /Theme: Light/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // The choice survives a reload because it is stored in a cookie.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(errors).toEqual([]);
  });
});

test.describe("mobile layout", () => {
  for (const path of ["/", "/design-system"]) {
    test(`${path} fits the screen without sideways scrolling`, async ({ page }) => {
      await page.goto(path);
      const viewport = page.viewportSize();
      const size = await page.evaluate(() => ({
        inner: window.innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      // A wider layout viewport means the browser zoomed out to fit content.
      expect(size.inner).toBe(viewport?.width);
      expect(size.scroll).toBeLessThanOrEqual(size.inner);
    });
  }
});

test.describe("health endpoint", () => {
  test("reports configuration without leaking values", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body.checks).toEqual(
      expect.objectContaining({ config: expect.any(String), database: expect.any(String) }),
    );
    expect(JSON.stringify(body)).not.toMatch(/sb_|supabase\.co|eyJ/);
  });
});

test("unknown pages return 404 with a way back", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Go to the home page" })).toBeVisible();
});
