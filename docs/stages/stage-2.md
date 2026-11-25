# Stage 2 — Accounts, team, paywall and payments

Delivered 2026-11-25 · Pull request #2. Billing from Stage 5 was pulled forward into this stage.

## What you do (phone)

1. **Merge PR #2** on GitHub.
2. **Run the SQL:** paste `supabase/bundles/stage-2.sql` into Supabase → SQL Editor → Run. Do this once, after Stage 1.
3. **Supabase → Authentication → URL Configuration:**
   - Site URL: `https://coldchain-app-z971.vercel.app`
   - Redirect URLs: add `https://coldchain-app-z971.vercel.app/**`
4. **Supabase → Authentication → Sign In / Providers → Email → turn off "Confirm email"** for now. Supabase's built-in mailer only delivers to your own team's addresses, so customers would never get the confirmation e-mail. Turn it back on once an e-mail provider is connected.
5. **Razorpay, once international payments are approved:**
   - Razorpay → Account & Settings → API Keys → generate a **Live** key.
   - In Vercel, add `NEXT_PUBLIC_RAZORPAY_KEY_ID` (Key ID, not sensitive) and `RAZORPAY_KEY_SECRET` (sensitive).
   - Razorpay → Webhooks → Add: URL `https://coldchain-app-z971.vercel.app/api/webhooks/razorpay`, create a secret, events **payment.captured**, **payment.failed**, **order.paid**.
   - Add that secret in Vercel as `RAZORPAY_WEBHOOK_SECRET` (sensitive), then Redeploy.

Until step 5 is done, the billing page says card payment is being switched on and gives your e-mail address.

## What it does

- **Sign-up, sign-in, password reset.** Sign-in is rate limited by IP and e-mail. After sign-in, users go back to the page they asked for, and only to pages on this site.
- **Onboarding** creates the company and starts the 14-day trial.
- **Team.** Owners and admins create an invitation link (valid 7 days, stored only as a hash), copy it and send it any way they like. They can also change roles, remove people, and withdraw invitations. The owner can transfer ownership.
- **Company and account settings.** Company details are copied onto every invoice.
- **Paywall:** `trial` → `active` (paid) → `grace` (3 days after expiry, with a banner) → `locked` (only billing and account pages open; data is kept).
- **Payments.** Razorpay Orders: one payment buys one month or one year, and the setup fee is added to the first payment only. Payment is confirmed twice, by the checkout signature and by the webhook, and activation is idempotent, so you are never charged twice for the same period or given an extra invoice. Paying early adds the new period after the current one.
- **Invoices** are numbered `CCO-2026-000001`, with a print/PDF view.

## Tests (CI)

✅ 128 database assertions (18 new for billing and the paywall), unit tests for signatures, money and redirects, browser tests for every new screen (desktop and phone), lint, type check, build and Vercel build.

## Not done yet

- **E-mail sending** (confirmation, password reset and invitation e-mails to customers) needs an e-mail provider such as Resend. Invitations work today by copying the link.
- **Automatic renewal.** Each period is paid manually from the billing page, and the banner reminds the owner. Auto-debit with Razorpay Subscriptions can come later.
- **Tax on invoices.** No GST or VAT line is added. Confirm the wording with your CA before the first live invoice.
- **Company switcher** for people in several companies. The first company is used.
- **Warehouses, sensors, alerts, incidents, reports and super admin** are next.
