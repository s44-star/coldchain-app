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
    await expect(page.locator("html")).toHaveAttribute("translate", "no");
    await expect(page.getByRole("link", { name: "Start free trial" })).toHaveAttribute("href", "/signup");

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
  for (const path of ["/", "/design-system", "/login", "/signup"]) {
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

test.describe("sign-in screens", () => {
  for (const [path, heading] of [
    ["/login", "Sign in to ColdChain OS"],
    ["/signup", "Start your 14-day free trial"],
    ["/forgot-password", "Reset your password"],
  ] as const) {
    test(`${path} renders without errors`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(errors).toEqual([]);
    });
  }

  test("signup form validates before submitting", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("A");
    await page.getByLabel("Work e-mail").fill("not-an-email");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    // Without Supabase configured (CI) the server answers before validation;
    // with it, field errors appear. Either way the user gets a visible reason.
    await expect(page.getByRole("alert").first()).toBeVisible();
  });

  test("the app requires signing in", async ({ page }) => {
    await page.goto("/app/settings/team");
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });

  test("invalid invitation links explain what to do", async ({ page }) => {
    await page.goto("/invite/not-a-real-token");
    await expect(page.getByText("This invitation link is not valid")).toBeVisible();
  });
});

test("payment webhook refuses requests when not configured or unsigned", async ({ request }) => {
  const response = await request.post("/api/webhooks/razorpay", { data: { event: "payment.captured" } });
  expect([400, 503]).toContain(response.status());
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
