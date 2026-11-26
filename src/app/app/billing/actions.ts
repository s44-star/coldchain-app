"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAppContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/roles";
import { isServerEnvConfigured } from "@/lib/env";
import { marketForCountry } from "@/lib/market";
import { rateLimit } from "@/lib/rate-limit";
import { createRazorpayOrder, razorpayConfig } from "@/lib/razorpay";
import { verifyPaymentSignature } from "@/lib/razorpay-signature";
import { createAdminClient } from "@/lib/supabase/admin";

export type CheckoutStart =
  | { ok: false; error: string }
  | {
      ok: true;
      orderId: string;
      amountCents: number;
      currency: string;
      keyId: string;
      companyName: string;
      planName: string;
      email: string;
      name: string;
    };

const startSchema = z.object({
  planCode: z.string().regex(/^[a-z0-9_]{2,32}$/),
  interval: z.enum(["monthly", "annual"]),
});

/** Creates a Razorpay order for the chosen plan and records it as pending. */
export async function startCheckout(input: { planCode: string; interval: "monthly" | "annual" }): Promise<CheckoutStart> {
  const ctx = await getAppContext();
  if (!can.manageBilling(ctx.role)) return { ok: false, error: "Only the company owner can pay." };

  const config = razorpayConfig();
  if (!config || !isServerEnvConfigured()) return { ok: false, error: "Online payment is not switched on yet." };

  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a plan." };
  if (!(await rateLimit(`checkout:${ctx.company.companyId}`, 20, 3600))) {
    return { ok: false, error: "Too many payment attempts. Try again in an hour." };
  }

  const admin = createAdminClient();
  const { data: company } = await admin.from("companies").select("country_code").eq("id", ctx.company.companyId).maybeSingle();
  const market = marketForCountry(company?.country_code);
  const { data: plan } = await admin
    .from("subscription_plans")
    .select("*")
    .eq("code", parsed.data.planCode)
    .eq("is_active", true)
    .eq("requires_contact", false)
    .eq("market", market)
    .maybeSingle();
  if (!plan) return { ok: false, error: "This plan is not available." };

  const price = parsed.data.interval === "annual" ? plan.annual_price_cents : plan.monthly_price_cents;
  if (!price) return { ok: false, error: "This plan has no price for that billing period." };

  // The setup fee is charged once, with the first successful payment.
  const { count: paidBefore } = await admin
    .from("payment_records")
    .select("id", { count: "exact", head: true })
    .eq("company_id", ctx.company.companyId)
    .eq("status", "captured");
  const setupFee = paidBefore ? 0 : plan.setup_fee_cents;
  const amountCents = price + setupFee;

  let order: { id: string };
  try {
    order = await createRazorpayOrder(config, {
      amountCents,
      currency: plan.currency,
      receipt: `cco_${ctx.company.companyId.slice(0, 8)}_${Date.now()}`,
      notes: { company_id: ctx.company.companyId, plan: plan.code, interval: parsed.data.interval },
    });
  } catch (error) {
    console.error("startCheckout: order creation failed", error);
    // Razorpay refuses foreign-currency orders until international payments are
    // approved; say so plainly instead of "try again".
    if (plan.currency !== "INR" && /\((400|401|403)\)/.test(String(error))) {
      return {
        ok: false,
        error: "Card payments in US dollars are being switched on. E-mail ceo@lexconv.com and we will send you a payment link today.",
      };
    }
    return { ok: false, error: "The payment service did not respond. Try again in a minute." };
  }

  const { error } = await admin.from("payment_records").insert({
    company_id: ctx.company.companyId,
    provider: "razorpay",
    provider_order_id: order.id,
    amount_cents: amountCents,
    currency: plan.currency,
    purpose: "subscription",
    status: "created",
    plan_id: plan.id,
    billing_interval: parsed.data.interval,
    setup_fee_cents: setupFee,
    period_months: parsed.data.interval === "annual" ? 12 : 1,
    created_by: ctx.userId,
  });
  if (error) {
    console.error("startCheckout: payment record failed", error.message);
    return { ok: false, error: "Could not start the payment. Try again." };
  }

  return {
    ok: true,
    orderId: order.id,
    amountCents,
    currency: plan.currency,
    keyId: config.keyId,
    companyName: ctx.company.companyName,
    planName: plan.name,
    email: ctx.email,
    name: ctx.profile?.full_name ?? "",
  };
}

/** Called by the checkout success handler. The webhook confirms the same payment independently. */
export async function confirmCheckout(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getAppContext();
  const config = razorpayConfig();
  if (!config || !can.manageBilling(ctx.role)) return { ok: false, error: "Not allowed." };

  if (!verifyPaymentSignature(input.orderId, input.paymentId, input.signature, config.keySecret)) {
    return { ok: false, error: "We could not verify this payment. If money was taken, it will be confirmed within minutes." };
  }

  const admin = createAdminClient();
  const { data: record } = await admin
    .from("payment_records")
    .select("id")
    .eq("provider", "razorpay")
    .eq("provider_order_id", input.orderId)
    .eq("company_id", ctx.company.companyId)
    .maybeSingle();
  if (!record) return { ok: false, error: "Payment not found." };

  const { error } = await admin.rpc("record_payment_success", {
    p_order_id: input.orderId,
    p_payment_id: input.paymentId,
  });
  if (error) {
    console.error("confirmCheckout: activation failed", error.message);
    return { ok: false, error: "Payment received; activation is delayed. It will complete automatically." };
  }

  revalidatePath("/app", "layout");
  return { ok: true };
}
