# Stage 6 — Activity log, admin tools, data retention, launch

## What ships
- **Activity** (`/app/settings/activity`, Owner/Admin): every change to the company's setup in
  plain words, from the insert-only audit log. Filter by type, page back through history.
- **Super admin:** `/admin/activity` (whole platform), `/admin/users` (search, companies, roles),
  `/admin/settings` (trial length, retention months; connection status shown as set/missing only).
- **Retention:** `run_housekeeping()` runs daily at 03:17 UTC (`coldchain-housekeeping`):
  readings older than `reading_retention_months` (default 24, never below 3) are moved into
  `sensor_readings_hourly` (min / max / sum / count per sensor-hour; average = sum ÷ count),
  invalid readings excluded. Sent/failed e-mail delivery rows older than 90 days are pruned.
- **Audit hardening:** secret settings (`*secret*`, `*token*`, `*password*`, `*api_key*`) are
  logged as changed but never with their value; values already logged are scrubbed.

## Known limits
- Reports read raw readings, so periods older than the retention window show no rows yet.
  The hourly table holds that history; a report mode over it is a follow-up if a customer needs
  more than 24 months.

## Setup
1. Run `supabase/bundles/stage-6.sql` in the Supabase SQL editor.
2. Custom domain: see `docs/LAUNCH.md`.
