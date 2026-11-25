# Stage 4: Operations, reports and super admin

Delivered 2026-11-26. Pull request #6. This stage also includes Stage 6 (super admin) and the plan limits from Stage 5.

## What you do (phone)

1. **Merge PR #6.**
2. **Run the SQL:** paste `supabase/bundles/stage-4.sql` into Supabase → SQL Editor and press Run, once.
3. **Make yourself super admin**, once. Run this in the SQL Editor with the e-mail address you signed up with:
   ```sql
   insert into public.platform_admins (user_id, note)
   select id, 'founder' from auth.users where email = 'YOUR-EMAIL';
   ```
   Then open `/admin`.

## What it does

- **Incidents.** Report one on its own, or straight from an alert. Add photos or PDFs up to 10 MB: they upload directly to private storage and the server checks the file's real type. Each incident has a timeline of updates, a root cause, a corrective action, and a required resolution. Closed incidents keep their full record.
- **Equipment and maintenance.**
  - Register equipment per warehouse, then add a recurring schedule.
  - Each schedule creates its first task. Completing a task (with a note) creates the next task automatically.
  - An overdue task raises an alert. Completing the task resolves that alert.
- **Inspections:** pass, needs attention or fail, with findings and corrective action.
- **Reports.** Six reports: temperature log, compliance summary, alert history, incident report, maintenance log and audit trail (owner/admin only).
  - Each report covers one warehouse for a date range of up to 1 year, with times in that warehouse's time zone.
  - Each report downloads as a **CSV**, or opens as a printable page you can **save as PDF**.
  - Simulated data is flagged, and every export is recorded.
  - CSV cells cannot run as Excel formulas.
- **Notifications:** an in-app list with an unread count in the menu and "mark all as read".
- **Plan limits:**
  - Starter: 1 warehouse, 10 zones, 25 sensors, 5 users.
  - Professional: 5 warehouses, 60 zones, 150 sensors, 25 users.
  - Trials get Professional limits.
  - The billing page shows usage, and a blocked action says which limit was hit.
- **Super admin (`/admin`):**
  - All companies, with search.
  - For any company: extend its trial, change its status (including suspending it), or mark it as a demo account (no limits, no paywall).
  - Members and payments per company.
  - Edit plan prices and limits.
  - Payment and webhook health.

## Tests

✅ 165 database assertions, including new ones for maintenance automation, the overdue sweep and plan limits. Plus unit tests (CSV safety), browser tests, lint, type check and build.

## Not done yet

- **Alerts by e-mail or SMS.** This needs an e-mail provider such as Resend (free tier) and an SMS provider.
- **Automatic renewal** of subscriptions.
- **Raw readings beyond 24 months.** These are kept as-is for now; an archiving job is still to come.
