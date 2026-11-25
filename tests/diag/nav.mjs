// Diagnostic: sign up on the live site and try the app navigation.
import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE_URL;
const email = `ci-smoke-${Date.now()}@lexconv.com`;
const log = (...a) => console.log("DIAG", ...a);

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["Pixel 7"] });
const page = await context.newPage();
page.on("console", (m) => log("console", m.type(), m.text().slice(0, 300)));
page.on("pageerror", (e) => log("pageerror", e.message.slice(0, 300)));
page.on("requestfailed", (r) => log("requestfailed", r.url().slice(0, 150), r.failure()?.errorText));
page.on("response", (r) => {
  if (!r.url().includes("/_next/static")) log("response", r.status(), r.request().method(), r.url().slice(0, 150));
});

await page.goto(`${BASE}/signup`);
await page.getByLabel("Full name").fill("CI Smoke Test");
await page.getByLabel("Work e-mail").fill(email);
await page.getByLabel("Password").fill("ci-smoke-password-123");
await page.getByRole("button", { name: "Create account" }).click();
await page.waitForLoadState("networkidle");
log("after signup url", page.url());

if (page.url().includes("/onboarding")) {
  await page.getByLabel("Company name").fill("CI smoke test company (delete me)");
  await page.getByLabel("Country").selectOption("NL");
  await page.getByRole("button", { name: "Create company" }).click();
  await page.waitForURL(/\/app/, { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
}
log("app url", page.url());
log("nav html", (await page.locator("nav[aria-label=App]").innerHTML().catch(() => "none")).slice(0, 1500));

const link = page.getByRole("link", { name: "Team" });
log("team link count", await link.count());
if (await link.count()) {
  const box = await link.first().boundingBox();
  log("team box", JSON.stringify(box));
  if (box) {
    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el ? `${el.tagName}.${el.className}` : "none";
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    log("element at team link", hit);
  }
  await link.first().click({ timeout: 10000 }).catch((e) => log("click error", e.message.slice(0, 300)));
  await page.waitForTimeout(6000);
  log("after click url", page.url());
  log("h1", await page.locator("h1").first().innerText().catch(() => "none"));
}
await browser.close();
