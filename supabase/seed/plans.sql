-- =============================================================================
-- ColdChain OS · seed/plans.sql
-- Starting price list. Run once after the migrations. Re-running never
-- overwrites prices already edited in the super admin.
--
-- DEFAULT PRICES — review before Stage 5 (payments). Amounts are in cents.
-- =============================================================================

insert into public.subscription_plans (
  code, name, description, currency,
  monthly_price_cents, annual_price_cents, setup_fee_cents,
  max_warehouses, max_zones, max_sensors, max_users,
  features, requires_contact, sort_order
) values
(
  'starter', 'Starter', 'One site, fully monitored.', 'USD',
  14900, 149000, 29900,
  1, 10, 25, 5,
  '["Live temperature & humidity monitoring", "Threshold alerts", "Incident log with photos", "CSV & PDF reports", "Audit trail"]'::jsonb,
  false, 10
),
(
  'professional', 'Professional', 'Multi-site operations with maintenance and inspections.', 'USD',
  44900, 449000, 79900,
  5, 60, 150, 25,
  '["Everything in Starter", "Up to 5 warehouses", "Maintenance schedules & inspections", "Warehouse-scoped managers", "Priority support"]'::jsonb,
  false, 20
),
(
  'enterprise', 'Enterprise', 'Custom limits, onboarding and integrations.', 'USD',
  null, null, 0,
  null, null, null, null,
  '["Everything in Professional", "Unlimited warehouses & sensors", "Custom integrations", "Dedicated onboarding", "SLA"]'::jsonb,
  true, 30
)
on conflict (code) do nothing;
