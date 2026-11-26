-- =============================================================================
-- ColdChain OS · seed/plans_in.sql
-- Rupee plans for companies in India: same limits and features as the dollar
-- plans. Run after plans.sql and 0019. Re-running never overwrites prices
-- edited in the super admin. Amounts are in paise.
-- =============================================================================

insert into public.subscription_plans (
  code, name, description, currency, market, monthly_price_cents, annual_price_cents, setup_fee_cents,
  max_warehouses, max_zones, max_sensors, max_users, features, is_active, is_public, requires_contact, sort_order
)
select
  g.code || '_in', g.name, g.description, 'INR', 'in', p.monthly, p.annual, p.setup,
  g.max_warehouses, g.max_zones, g.max_sensors, g.max_users, g.features, g.is_active, g.is_public, g.requires_contact, g.sort_order
from public.subscription_plans g
join (values
  ('starter',      499900,  4999000,  999900),
  ('professional', 1499900, 14999000, 2499900),
  ('enterprise',   null::integer, null::integer, 0)
) as p (code, monthly, annual, setup) on p.code = g.code
where g.market = 'global'
on conflict (code) do nothing;

