# ColdChain OS — Setup

Everything here can be done from a phone browser. Each step says where to tap.

## 1. Database (Supabase)

Run once, on the Europe-region project.

1. Open **github.com/s44-star/coldchain-app** → `supabase/bundles/stage-1.sql` → **Raw** → select all → copy.
2. Supabase → your project → **SQL Editor** → **New query** → paste → **Run**.
3. It should finish with "Success. No rows returned". If it stops with an error, nothing after the error ran — send the message as it appears.

The bundle is all of `supabase/migrations/0001…0013` plus `supabase/seed/plans.sql`, in order. Later stages add new numbered files; only those new files get run.

### Become super admin (after you sign up in Stage 2)

```sql
insert into public.platform_admins (user_id, note)
select id, 'founder' from auth.users where email = 'spraharaj68@gmail.com';
```

## 2. Vercel environment variables

Vercel → project `coldchain-app-z971` → **Settings** → **Environment Variables**. Add for **Production** and **Preview**:

| Name | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → Publishable key (`sb_publishable_…`) |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → Secret key (`sb_secret_…`). Mark it **Sensitive**. |
| `NEXT_PUBLIC_SITE_URL` | `https://coldchain-app-z971.vercel.app` |

Then **Deployments** → latest → **⋯** → **Redeploy** so the values take effect.

## 3. Check it works

Open `https://coldchain-app-z971.vercel.app/api/health`. Expected:

```json
{ "status": "ok", "checks": { "config": "ok", "serverConfig": "ok", "database": "ok" } }
```

- `config: "missing"` → a `NEXT_PUBLIC_…` variable is missing or misspelled.
- `serverConfig: "missing"` → `SUPABASE_SECRET_KEY` is missing.
- `database: "error"` → the SQL in step 1 has not run, or the URL/key belong to another project.

The design system is at `/design-system` (not indexed by search engines).

## Local development (when a machine with Node 22 is available)

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm run lint` · `npm run typecheck` | Static checks |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser smoke tests against `npm run build` output (Playwright) |
| `npm run test:db` | Applies every migration to a throw-away Postgres and runs the RLS test suite |
| `npm run db:bundle` | Rebuilds `supabase/bundles/stage-1.sql` after a migration changes |
| `npm run db:types:local` | Regenerates `src/types/database.ts` from the test database |

CI (GitHub Actions) runs all of these on every push and pull request.
