# Stage 3: Monitoring and alerts

Delivered 2026-11-25. Pull request #5. The alert engine from Stage 4 was brought forward into this stage.

## What you do (phone)

1. **Merge PR #5.**
2. **Supabase → Database → Extensions → search "pg_cron" → Enable.** This turns on the 5-minute check that spots sensors which stopped reporting.
3. **Run the SQL.** Paste `supabase/bundles/stage-3.sql` into the SQL Editor and press Run, once.
4. **Try it:**
   - Warehouses → add a warehouse.
   - Open the warehouse → add a zone (for example 2 to 8 °C) → register a sensor.
   - Open the sensor → **Add 24 hours of simulated readings**, then **Simulate an excursion**.
   - Check Overview, Alerts and the zone chart.

## What it does

- **Warehouses.** Create, edit and archive them. Assign warehouse managers to specific sites.
- **Zones.** Temperature and humidity limits, plus a reading interval. Each zone page shows a live value, a 24-hour chart with the tolerance band, recent readings, and manual readings for handheld checks.
- **Sensors.** Register by device ID. Each device gets its own key, shown once and stored only as a hash, and keys can be withdrawn. The sensor page shows the connection instructions for whoever installs the logger.
- **Ingestion API** at `POST /api/ingest/readings`: a single reading or up to 500 buffered readings per request. Timestamps are checked against clock-skew limits. Duplicates are ignored. Physically impossible values are kept but marked invalid. Each device key is limited to 120 requests per minute.
- **Alert engine** (in the database, one transaction per batch):
  - A reading outside a zone's limits opens an alert. It is **critical** when the gap is bigger than the company's critical excursion, otherwise **warning**.
  - Repeats count on the same open alert and can escalate it, never downgrade it.
  - Every member except viewers gets an in-app notification.
  - Manual readings are checked the same way.
- **Offline detection.** A sensor that misses two expected readings goes offline and raises an alert. It comes back automatically on its next reading.
- **Alerts page.** Acknowledge an alert, or resolve it with a required note. Every step is kept in the alert history and the audit log.
- **Simulated data.** Available to managers only. It is always labelled (a badge on dashboards, and alert titles start with "Simulated").
- **Live dashboards** refresh every 30 seconds while the page is open.

## Tests

✅ 152 database assertions, including 24 new ones for ingestion, alert dedupe and escalation, notifications, offline sweep, simulation and manual readings. Plus unit tests, browser tests, lint, type check and build.

## Not done yet

- E-mail and SMS for alerts (needs an e-mail provider, e.g. Resend).
- Incidents, maintenance, inspections, reports (CSV/PDF), super admin.
- Plan limits on warehouses and sensors per plan.
