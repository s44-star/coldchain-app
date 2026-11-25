import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/money";
import { verifyPaymentSignature, verifyWebhookSignature } from "@/lib/razorpay-signature";
import { safeNext } from "@/lib/validation";

const SECRET = "test_secret_value";

describe("Razorpay signatures", () => {
  const orderId = "order_N1a2b3c4d5";
  const paymentId = "pay_Z9y8x7w6v5";
  const good = createHmac("sha256", SECRET).update(`${orderId}|${paymentId}`).digest("hex");

  it("accepts a genuine checkout signature", () => {
    expect(verifyPaymentSignature(orderId, paymentId, good, SECRET)).toBe(true);
    expect(verifyPaymentSignature(orderId, paymentId, good.toUpperCase(), SECRET)).toBe(true);
  });

  it("rejects tampered or malformed signatures", () => {
    expect(verifyPaymentSignature(orderId, "pay_other", good, SECRET)).toBe(false);
    expect(verifyPaymentSignature(orderId, paymentId, good, "wrong_secret")).toBe(false);
    expect(verifyPaymentSignature(orderId, paymentId, "zz", SECRET)).toBe(false);
    expect(verifyPaymentSignature(orderId, paymentId, "", SECRET)).toBe(false);
  });

  it("verifies webhook bodies byte for byte", () => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    const sig = createHmac("sha256", SECRET).update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig, SECRET)).toBe(true);
    expect(verifyWebhookSignature(`${body} `, sig, SECRET)).toBe(false);
  });
});

describe("formatMoney", () => {
  it("formats cents as dollars", () => {
    expect(formatMoney(14900)).toBe("$149");
    expect(formatMoney(149000)).toBe("$1,490");
    expect(formatMoney(1999)).toBe("$19.99");
  });
});

describe("safeNext", () => {
  it("allows only same-site paths", () => {
    expect(safeNext("/app/billing")).toBe("/app/billing");
    expect(safeNext("https://evil.example")).toBe("/app");
    expect(safeNext("//evil.example")).toBe("/app");
    expect(safeNext("/\\evil.example")).toBe("/app");
    expect(safeNext(null, "/onboarding")).toBe("/onboarding");
  });
});
