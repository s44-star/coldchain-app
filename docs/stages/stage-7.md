# Stage 7 — India market (rupee plans)

## What ships
- Companies whose country is **India** see rupee plans (`starter_in`, `professional_in`,
  `enterprise_in`) and pay through domestic Razorpay (UPI, cards, netbanking). Every other
  country keeps the US-dollar plans. Checkout refuses a plan from the other market.
- Starting rupee prices (edit in `/admin/plans`): Starter ₹4,999/month, ₹49,990/year,
  ₹9,999 setup; Professional ₹14,999/month, ₹1,49,990/year, ₹24,999 setup; Enterprise on request.
  Limits and features match the dollar plans.
- Invoices record their seller at issue time (`invoices.seller_snapshot`): `seller_in` for INR,
  `seller_global` for USD, edited in `/admin/settings`. Issued invoices never change.
  Default Indian tax line: "Not registered under GST." (confirm with a CA).
- Until Razorpay international is approved, a USD checkout shows a clear "being switched on,
  e-mail us for a payment link" message. Once approved, nothing changes in code.
- PayPal: once linked inside Razorpay it appears in the Razorpay checkout for international
  payers. No code needed.
- Terms and privacy name the contracting entity per market, Indian law for Indian customers,
  and the DPDP Act 2023 grievance route.

## Setup
1. Run `supabase/bundles/stage-7.sql`.
2. `/admin/settings` → fill the Indian seller's full business name and address.
3. Razorpay live keys and webhook (see docs/LAUNCH.md).
