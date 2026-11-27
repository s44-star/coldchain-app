-- =============================================================================
-- ColdChain OS · stage-8 database changes (generated — do not edit)
-- Paste into Supabase → SQL Editor → Run, once. Run earlier stages first.
-- =============================================================================

-- >>> 0020_single_entity.sql
-- =============================================================================
-- ColdChain OS · 0020_single_entity
-- LexConv is one business, registered in India, selling in rupees and dollars.
-- Dollar invoices name the same Indian seller as rupee invoices.
-- =============================================================================

-- Default only: details already edited in the super admin are left alone.
update public.app_settings
set value = jsonb_build_object('name', 'LexConv', 'address', 'India', 'email', 'ceo@lexconv.com', 'tax_note', '')
where key = 'seller_global'
  and value ->> 'address' = 'United Kingdom';

-- No dollar payment could complete before international payments were enabled,
-- so any dollar invoice naming a UK seller is a test record: correct it.
alter table public.invoices disable trigger invoices_freeze_seller;
update public.invoices i
set seller_snapshot = (select value from public.app_settings where key = 'seller_global')
where i.seller_snapshot ->> 'address' = 'United Kingdom';
alter table public.invoices enable trigger invoices_freeze_seller;
