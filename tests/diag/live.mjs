// Checkout check: an Indian company sees rupee plans and the Razorpay window opens
// (an order is created, nothing is paid). A Dutch company sees dollar plans.
import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE_URL;
const log = (...a) => console.log("LIVE", ...a);
const problems = [];
const browser = await chromium.launch();

async function run(country, label) {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${label} pageerror: ${e.message.slice(0, 200)}`));
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`${label} HTTP ${r.status()} ${r.url().slice(0, 120)}`); });
  const email = `delivered+cc7${label}-${Date.now()}@resend.dev`;
  try {
    await page.goto(`${BASE}/signup`);
    await page.getByLabel("Full name").fill("CI Smoke Test");
    await page.getByLabel("Work e-mail").fill(email);
    await page.getByLabel("Password").fill("ci-smoke-password-123");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/onboarding/, { timeout: 20000 });
    await page.getByLabel("Company name").fill("CI smoke test company (delete me)");
    await page.getByLabel("Country").selectOption(country);
    await page.getByRole("button", { name: "Create company" }).click();
    await page.waitForURL(/\/app$/, { timeout: 20000 });
    await page.goto(`${BASE}/app/billing`);
    await page.waitForLoadState("networkidle").catch(() => {});
    const main = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    log(label, "prices", (main.match(/[₹$][\d,]+(\.\d+)?/g) ?? []).slice(0, 8).join(" "));
    log(label, "note", (main.match(/Prices in [^.]+\./) ?? ["-"])[0]);
    await page.getByRole("button", { name: "Choose Starter" }).click();
    const frame = page.locator("iframe.razorpay-checkout-frame, iframe[src*='razorpay']");
    const opened = await frame.first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    const alert = await page.locator("[role=alert], .text-critical").allInnerTexts().catch(() => []);
    const callouts = (await page.locator("main").innerText()).match(/(Card payments[^.]+\.|The payment service[^.]+\.|Online card payment[^.]+)/);
    log(label, "razorpay window opened:", opened, "| message:", callouts ? callouts[0] : alert.join(" ").slice(0, 200) || "-");
  } catch (e) {
    problems.push(`${label} FAILED: ${e.message.slice(0, 400).replace(/\n/g, " | ")}`);
  }
  await ctx.close();
}

await run("IN", "india");
await run("NL", "nl");
await browser.close();
log("PROBLEMS", problems.length);
for (const p of problems) log("PROBLEM", p);
