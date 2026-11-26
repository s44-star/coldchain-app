-- =============================================================================
-- Rupee plans and per-market seller details on invoices.
-- =============================================================================

do $$
declare v_plan uuid; v_inv record;
begin
  perform tests.as_postgres();
  perform tests.eq($q$ select count(*) from public.subscription_plans where market = 'in' and currency = 'INR' $q$, 3, 'three rupee plans');
  perform tests.eq($q$
    select count(*) from public.subscription_plans i join public.subscription_plans g on i.code = g.code || '_in'
    where i.max_sensors is not distinct from g.max_sensors and i.max_users is not distinct from g.max_users
      and i.features = g.features and i.requires_contact = g.requires_contact
  $q$, 3, 'rupee plans have the same limits and features');
  perform tests.eq($q$ select count(*) from public.subscription_plans where code = 'starter_in' and monthly_price_cents = 499900 and setup_fee_cents = 999900 $q$, 1, 'starter is ₹4,999 a month');

  -- A company in India pays in rupees.
  insert into public.companies (id, name, country_code, trial_ends_at)
  values ('d1000000-0000-4000-8000-0000000000a1'::uuid, 'Odisha Cold Store', 'IN', now() + interval '14 days');
  select id into v_plan from public.subscription_plans where code = 'starter_in';
  perform tests.as_service();
  insert into public.payment_records (company_id, provider_order_id, amount_cents, currency, purpose, plan_id, billing_interval, setup_fee_cents, period_months)
  values ('d1000000-0000-4000-8000-0000000000a1'::uuid, 'order_IN1', 499900 + 999900, 'INR', 'subscription', v_plan, 'monthly', 999900, 1);
  perform public.record_payment_success('order_IN1', 'pay_IN1', 'upi');

  select * into v_inv from public.invoices where company_id = 'd1000000-0000-4000-8000-0000000000a1'::uuid;
  perform tests.eq(format('select %s', v_inv.total_cents), 1499800, 'rupee invoice total');
  perform tests.eq(format($q$ select count(*) from public.invoices where id = %L and currency = 'INR' and seller_snapshot ->> 'tax_note' = 'Not registered under GST.' $q$, v_inv.id), 1, 'rupee invoice carries the Indian seller');
  perform tests.eq($q$ select count(*) from public.invoices where currency = 'USD' and (seller_snapshot ->> 'address') = 'United Kingdom' $q$,
                   (select count(*)::int from public.invoices where currency = 'USD'), 'dollar invoices carry the UK seller');

  -- Seller details are fixed once issued.
  perform tests.as_postgres();
  perform tests.throws(format($q$ update public.invoices set seller_snapshot = '{}'::jsonb where id = %L $q$, v_inv.id), 'issued seller cannot change', 'cannot be changed');
  update public.app_settings set value = jsonb_set(value, '{name}', '"Changed"') where key = 'seller_in';
  perform tests.eq(format($q$ select count(*) from public.invoices where id = %L and seller_snapshot ->> 'name' = 'LexConv' $q$, v_inv.id), 1, 'later setting changes leave old invoices alone');
  update public.app_settings set value = jsonb_set(value, '{name}', '"LexConv"') where key = 'seller_in';
end $$;

\echo 'All India market tests passed.'
