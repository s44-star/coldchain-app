"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckIcon } from "@/components/icons";
import { Button, buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { confirmCheckout, startCheckout } from "./actions";

export type PlanView = {
  code: string;
  name: string;
  description: string | null;
  currency: string;
  monthly: number | null;
  annual: number | null;
  setupFee: number;
  features: string[];
  requiresContact: boolean;
};

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayInstance = { open(): void; on(event: string, handler: (response: { error?: { description?: string } }) => void): void };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

export function PlanPicker({
  plans,
  nonce,
  setupPaid,
  paymentsEnabled,
  currentPlan,
}: {
  plans: PlanView[];
  nonce: string;
  setupPaid: boolean;
  paymentsEnabled: boolean;
  currentPlan: string | null;
}) {
  const router = useRouter();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  async function pay(plan: PlanView) {
    setBusy(plan.code);
    setError(null);
    const start = await startCheckout({ planCode: plan.code, interval: billing });
    if (!start.ok) {
      setError(start.error);
      setBusy(null);
      return;
    }
    if (!window.Razorpay) {
      setError("The payment window did not load. Check your connection and try again.");
      setBusy(null);
      return;
    }

    const checkout = new window.Razorpay({
      key: start.keyId,
      order_id: start.orderId,
      amount: start.amountCents,
      currency: start.currency,
      name: "ColdChain OS",
      description: `${start.planName} plan, ${billing === "annual" ? "12 months" : "1 month"}`,
      prefill: { email: start.email, name: start.name },
      notes: { company: start.companyName },
      theme: { color: "#165e78" },
      handler: async (response: RazorpayResponse) => {
        const result = await confirmCheckout({
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        });
        if (result.ok) {
          setPaid(true);
          router.refresh();
        } else {
          setError(result.error ?? "Payment could not be confirmed.");
        }
        setBusy(null);
      },
      modal: { ondismiss: () => setBusy(null) },
    });
    checkout.on("payment.failed", (response) => {
      setError(response.error?.description ?? "The payment failed. No money was taken.");
      setBusy(null);
    });
    checkout.open();
  }

  return (
    <div className="grid gap-6">
      {paymentsEnabled ? <Script src="https://checkout.razorpay.com/v1/checkout.js" nonce={nonce} strategy="afterInteractive" /> : null}

      {paid ? <Callout tone="ok" title="Payment received. Your plan is active." /> : null}
      {error ? <Callout tone="critical" title={error} /> : null}
      {!paymentsEnabled ? (
        <Callout tone="warn" title="Online card payment is being switched on">
          To start a plan today, e-mail ceo@lexconv.com and we will send you a payment link.
        </Callout>
      ) : null}

      <fieldset className="flex w-fit rounded-control border border-line-strong p-1">
        <legend className="sr-only">Billing period</legend>
        {(["monthly", "annual"] as const).map((option) => (
          <label
            key={option}
            className={cn(
              "cursor-pointer rounded-[4px] px-4 py-1.5 type-small transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
              billing === option ? "bg-primary text-primary-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            <input
              type="radio"
              name="billing"
              value={option}
              checked={billing === option}
              onChange={() => setBilling(option)}
              className="sr-only"
            />
            {option === "monthly" ? "Monthly" : "Yearly: 2 months free"}
          </label>
        ))}
      </fieldset>

      <ul className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const price = billing === "annual" ? plan.annual : plan.monthly;
          const isCurrent = currentPlan === plan.code;
          return (
            <li
              key={plan.code}
              className={cn(
                "grid content-start gap-4 rounded-panel border bg-surface p-5",
                isCurrent ? "border-primary ring-1 ring-primary" : "border-line",
              )}
            >
              <div className="grid gap-1">
                <h3 className="type-h2 text-ink">{plan.name}</h3>
                {plan.description ? <p className="type-small text-ink-muted">{plan.description}</p> : null}
              </div>
              {plan.requiresContact || price === null ? (
                <p className="type-h2 text-ink">Custom pricing</p>
              ) : (
                <div className="grid gap-1">
                  <p className="text-[2rem] leading-none font-medium tabular text-ink [font-stretch:110%]">
                    {formatMoney(price, plan.currency)}
                    <span className="ml-1 type-small font-normal text-ink-muted">/ {billing === "annual" ? "year" : "month"}</span>
                  </p>
                  {!setupPaid && plan.setupFee > 0 ? (
                    <p className="type-caption text-ink-muted">
                      + {formatMoney(plan.setupFee, plan.currency)} one-time setup with the first payment
                    </p>
                  ) : null}
                </div>
              )}
              <ul className="grid gap-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2 type-small text-ink">
                    <CheckIcon className="mt-0.5 shrink-0 text-ok" />
                    {feature}
                  </li>
                ))}
              </ul>
              {plan.requiresContact || price === null ? (
                <a
                  href={`mailto:ceo@lexconv.com?subject=${encodeURIComponent("ColdChain OS Enterprise")}`}
                  className={buttonClasses({ variant: "secondary" })}
                >
                  Talk to us
                </a>
              ) : (
                <Button
                  onClick={() => pay(plan)}
                  disabled={!paymentsEnabled || busy !== null}
                  loading={busy === plan.code}
                  variant={isCurrent ? "secondary" : "primary"}
                >
                  {isCurrent ? "Pay for the next period" : `Choose ${plan.name}`}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="type-caption text-ink-muted">
        Prices in US dollars. Each payment covers one month or one year; paying early adds the new period after the current
        one. Card payments are processed by Razorpay.
      </p>
    </div>
  );
}
