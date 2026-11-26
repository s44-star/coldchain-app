-- =============================================================================
-- ColdChain OS · stage-7 database changes (generated — do not edit)
-- Paste into Supabase → SQL Editor → Run, once. Run earlier stages first.
-- =============================================================================

-- >>> 0019_india_market.sql
-- =============================================================================
-- ColdChain OS · 0019_india_market
-- Companies in India see rupee plans and pay through domestic Razorpay; every
-- other country keeps the US-dollar plans. Each invoice records the seller it
-- was issued by (Indian or UK entity), taken from app_settings when issued.
-- =============================================================================

alter table public.subscription_plans
  add column if not exists market text not null default 'global' check (market in ('global', 'in'));
comment on column public.subscription_plans.market is
  'global = US-dollar plans for every country except India; in = rupee plans for companies in India.';

-- Rupee plans themselves are added by supabase/seed/plans_in.sql (runs after
-- the dollar plans exist).

-- -----------------------------------------------------------------------------
-- Seller details per market
-- -----------------------------------------------------------------------------
insert into public.app_settings (key, value, description, is_public) values
  ('seller_global', jsonb_build_object(
      'name', 'LexConv', 'address', 'United Kingdom', 'email', 'ceo@lexconv.com', 'tax_note', ''),
   'Seller shown on US-dollar invoices', false),
  ('seller_in', jsonb_build_object(
      'name', 'LexConv', 'address', 'India', 'email', 'ceo@lexconv.com', 'tax_note', 'Not registered under GST.'),
   'Seller shown on rupee invoices', false)
on conflict (key) do nothing;

alter table public.invoices add column if not exists seller_snapshot jsonb;
comment on column public.invoices.seller_snapshot is 'Seller name, address, e-mail and tax note at the time of issue.';

create or replace function private.stamp_invoice_seller()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.seller_snapshot is null then
    select value into new.seller_snapshot
    from public.app_settings
    where key = case when new.currency = 'INR' then 'seller_in' else 'seller_global' end;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_stamp_seller on public.invoices;
create trigger invoices_stamp_seller
  before insert on public.invoices
  for each row execute function private.stamp_invoice_seller();

-- The seller on an issued invoice never changes.
create or replace function private.freeze_invoice_seller()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.seller_snapshot is distinct from old.seller_snapshot then
    raise exception 'The seller on an issued invoice cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_freeze_seller on public.invoices;
create trigger invoices_freeze_seller
  before update on public.invoices
  for each row execute function private.freeze_invoice_seller();

-- Older invoices (all USD) get the dollar seller once.
alter table public.invoices disable trigger invoices_freeze_seller;
update public.invoices i
set seller_snapshot = (select value from public.app_settings where key = 'seller_global')
where i.seller_snapshot is null;
alter table public.invoices enable trigger invoices_freeze_seller;

-- >>> plans_in.sql
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

