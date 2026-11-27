# Stage 5 — Alert e-mails, legal pages, company switcher

## What ships
- **Alert e-mails.** Every new alert queues one e-mail per owner/admin/manager/operator
  (`notification_deliveries`). Viewers and users who turned e-mails off are skipped.
  A worker (`/api/cron/deliver`) sends them through Resend:
  - pg_cron calls it every minute through pg_net (`coldchain-deliver`), with `CRON_SECRET`.
  - It also runs straight after sensor ingestion or a simulated excursion raises an alert.
  - Rows are claimed atomically (`claim_deliveries`, leased for 10 minutes, at most 5 attempts,
    back-off 1/4/9/16 min). Permanent errors (4xx) fail at once.
  - Without `RESEND_API_KEY` rows are marked `provider_not_configured`; nothing pretends to send.
- **Your account → "E-mail me when an alert is raised"** (`profiles.email_alerts`).
- **Legal pages:** `/terms`, `/privacy`, `/refunds`, `/contact`, linked from the footer and signup.
  Written for LexConv (India); have a lawyer review them before large customers sign.
- **Alert texts** no longer show trailing zeros (`8 °C`, not `8.00 °C`).
- **Company switcher** in the sidebar for people in more than one company.

## Setup
1. Run `supabase/bundles/stage-5.sql` in the Supabase SQL editor.
2. Enable the `pg_net` extension (Database → Extensions) if the bundle could not.
3. Store the worker URL and secret in the database:
   ```sql
   insert into public.app_settings (key, value) values
     ('delivery_worker_url', to_jsonb('https://coldchain-app-z971.vercel.app/api/cron/deliver'::text)),
     ('cron_secret', to_jsonb('<same value as CRON_SECRET>'::text))
   on conflict (key) do update set value = excluded.value;
   ```
4. Vercel env vars: `CRON_SECRET` (same value), `RESEND_API_KEY`, `EMAIL_FROM`
   (e.g. `ColdChain OS <alerts@lexconv.com>`), then redeploy.
5. Resend: add and verify the `lexconv.com` domain (DNS records at the domain registrar).
