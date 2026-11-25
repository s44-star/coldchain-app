# Stage 1 — Foundation

Delivered 2026-11-24 · Pull request #1 · Scope from [ARCHITECTURE.md §9](../ARCHITECTURE.md#9-roadmap): Next.js setup, design system, full schema + RLS migrations, `.env.example`.

## What you do now

1. **Run the SQL** — paste `supabase/bundles/stage-1.sql` into Supabase → SQL Editor → Run. Details in [SETUP.md §1](../SETUP.md#1-database-supabase).
2. **Add 4 environment variables in Vercel** (`coldchain-app-z971`) and redeploy — [SETUP.md §2](../SETUP.md#2-vercel-environment-variables).
3. **Open `/api/health`** on the deployment — all three checks should say `ok`.
4. **Remove the extra Vercel projects.** Four Vercel projects build this repo on every push: `coldchain-app-z971` (the real one), `coldchain-app`, `coldchain-app-44`, `coldchain-app-nxu5`. Delete the last three (Project → Settings → Advanced → Delete Project), or they keep failing and use build minutes.

## Database

13 migrations in `supabase/migrations/`, plus `supabase/seed/plans.sql`.

| File | Contents |
|---|---|
| 0001_foundation | `private` schema (not exposed to the API), 27 enum types, shared triggers (`updated_at`, immutable-column guard), time-zone validation |
| 0002_identity_tenancy | profiles (auto-created on signup), companies, members (exactly one owner), invitations (token stored as SHA-256), platform admins |
| 0003_operations | warehouses, manager assignments, zones, equipment, sensors, device keys (hash only), readings |
| 0004_alerts_incidents_maintenance | alerts (+ dedupe), alert history, incidents, timeline, attachments, maintenance schedules/tasks, inspections |
| 0005_reporting_audit_notifications | report records, insert-only audit log, notifications, delivery outbox |
| 0006_billing | plans, subscriptions, payments, refunds, invoices (numbered `CCO-2026-000001`), webhook events (idempotent) |
| 0007_platform | settings (trial 14 days, international payments off, retention 24 months), rate limiter |
| 0008_access_helpers | `is_platform_admin`, `is_company_member`, `has_company_role`, `member_company_ids`, `managed_warehouse_ids`, `colleague_ids` |
| 0009_rls_policies | RLS on all 32 tables, policies per the role matrix, narrowed grants (anon can read only the price list) |
| 0010_business_rules | actor stamping, alert/incident state transitions, automatic history and timeline, operator limits on tasks |
| 0011_audit_trail | row-level audit trigger on 23 tables (actor, IP, changes; secrets never logged) |
| 0012_tenancy_functions | `create_company`, `get_invitation`, `accept_invitation`, `transfer_ownership` |
| 0013_storage | private `incident-attachments` bucket (10 MB, JPEG/PNG/WebP/PDF) with per-company policies |

### Refinements to ARCHITECTURE.md made during the build

- **Readings use a `bigint` key**, not UUID. Readings are the one high-volume, append-only table; a 64-bit key keeps it and its indexes about half the size. Every other table uses UUIDs.
- **Helpers live in a `private` schema** so the API cannot call them directly; policies still use them.
- **Company creation, invitation acceptance and ownership transfer are database functions.** Each runs as one transaction, so a company can never exist without an owner and an invitation can never be used twice.
- **Warehouse managers manage only warehouses assigned to them.** A manager with no assignment can view everything but configure nothing.
- **Resolving or closing an incident requires a resolution text.**
- **Default prices** (in `seed/plans.sql`, editable later in super admin): Starter $149/month, $1,490/year, $299 setup; Professional $449/month, $4,490/year, $799 setup; Enterprise on request. Confirm or change before Stage 5.

## App

- **Next.js 16** (App Router, TypeScript strict), Tailwind CSS 4, Supabase SSR.
- **Security:** per-request nonce Content-Security-Policy (`src/proxy.ts`), HSTS, frame-deny, no `X-Powered-By`; secrets read only on the server; environment validated at runtime so a missing value never breaks the build.
- **Supabase clients:** browser (publishable key), server (user session, RLS applies), admin (secret key, server-only, for webhooks / ingestion / cron).
- **Glacier design system** (`src/components`): Archivo with its width axis for hierarchy, light app theme with dark mode (stored in a cookie, no flash), buttons, form fields with accessible errors, status badges mapped from database states, callouts, tables, zone reading with tolerance band, empty and loading states. Preview at `/design-system`.
- **Marketing page** (`/`): dark, built around a 24-hour 2–8 °C trace with one excursion. The chart is labelled as an illustration.
- **`/api/health`**: reports whether configuration and database are reachable, without revealing values.
- **Hosting:** `vercel.json` fixes the framework preset to Next.js and runs server code in Frankfurt (`fra1`), next to the EU database. `package-lock.json` pins every dependency; the **Refresh lockfile** workflow updates it on demand.

## Tests

| Suite | Where | Result |
|---|---|---|
| Database: migrations + RLS | `supabase/tests` — Postgres 17 in CI | ✅ 110 assertions + 4 static checks (RLS on every table, a policy on every table, pinned `search_path` on definer functions, nothing readable by anonymous users except the price list) |
| Unit | `tests/unit` — Vitest | ✅ 20 tests |
| End-to-end | `tests/e2e` — Playwright, desktop + mobile Chrome | ✅ 18 tests: pages render under the strict CSP with no console errors, every script carries the nonce, security headers present, theme switch persists, no sideways scrolling on phones, 404 page, health endpoint leaks nothing |
| Lint, type check, production build | CI | ✅ |
| Dependency audit (`npm audit`, high and above) | CI | ✅ none |
| Vercel production build (`coldchain-app-z971`) | Vercel | ✅ |

The mobile end-to-end test caught one real bug during the build: the zones table was wide enough to make phones zoom the whole page out. Tables now scroll inside their own box.

## Not done yet

- **No sign-up or login screens** — Stage 2. Until then the app has only the marketing page, the design system and the health check.
- **Plan limits are not enforced** (max warehouses, sensors, users) — Stage 5, together with billing.
- **Deleting a user who owns a company** leaves the company without an owner; ownership must be transferred first. The Stage 2 account-deletion flow will enforce this.
- **Reading retention job** (24 months, then hourly aggregates) — Stage 3/4 cron.
- **Invoice tax wording (GST/VAT)** must be confirmed with your CA before live billing.
