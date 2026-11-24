# ColdChain OS

Multi-tenant cold-chain monitoring and operations SaaS by LexConv: live temperature and humidity monitoring for cold-storage warehouses, alerts and incidents, maintenance, audit-ready reports, and subscription billing.

**Stack:** Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · Supabase (Postgres + RLS, Auth, Storage, EU region) · Razorpay · Vercel

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture, data model, roadmap, costs |
| [docs/SETUP.md](docs/SETUP.md) | Database setup, environment variables, health check, commands |
| [docs/stages/stage-1.md](docs/stages/stage-1.md) | What Stage 1 delivered and what is left |

## Layout

```
supabase/migrations/   numbered SQL migrations (schema, RLS, triggers, functions)
supabase/seed/         starting price list
supabase/bundles/      generated one-paste SQL per stage
supabase/tests/        migration + RLS test suite (runs in CI on Postgres 17)
src/app/               routes: marketing site, design system, API
src/components/        Glacier design system and shared components
src/lib/               env validation, Supabase clients, CSP, formatting
src/types/database.ts  generated database types
tests/                 unit (Vitest) and end-to-end (Playwright)
```
