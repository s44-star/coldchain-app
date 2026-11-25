import "server-only";

/**
 * Razorpay Orders API. Each payment buys a prepaid period; activation runs in
 * the database (public.record_payment_success) after the signature checks.
 */

export type RazorpayConfig = { keyId: string; keySecret: string };

export function razorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return keyId && keySecret ? { keyId, keySecret } : null;
}

export async function createRazorpayOrder(
  config: RazorpayConfig,
  order: { amountCents: number; currency: string; receipt: string; notes: Record<string, string> },
): Promise<{ id: string; amount: number; currency: string }> {
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: order.amountCents,
      currency: order.currency,
      receipt: order.receipt.slice(0, 40),
      notes: order.notes,
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    amount?: number;
    currency?: string;
    error?: { code?: string; description?: string };
  };
  if (!response.ok || !body.id) {
    throw new Error(`Razorpay order failed (${response.status}): ${body.error?.description ?? "no details"}`);
  }
  return { id: body.id, amount: body.amount ?? order.amountCents, currency: body.currency ?? order.currency };
}
