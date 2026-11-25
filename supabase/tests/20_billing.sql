-- =============================================================================
-- Billing: paywall state, idempotent payment activation, invoices.
-- Runs after 10_tenancy_and_rls.sql (company A still exists; B was deleted).
-- =============================================================================

do $$
declare v uuid;
begin
  perform tests.create_user('f0000000-0000-4000-8000-000000000001', 'payer@example.com');
  perform tests.create_user('f0000000-0000-4000-8000-000000000002', 'payer.viewer@example.com');
  perform tests.as_user('f0000000-0000-4000-8000-000000000001');
  v := public.create_company('Charlie Frozen Foods', 'BE');
  perform tests.put('company_c', v);
  perform tests.as_postgres();
  insert into public.company_members (company_id, user_id, role)
  values (v, 'f0000000-0000-4000-8000-000000000002', 'viewer');
end $$;

do $$ begin
  perform tests.as_user('f0000000-0000-4000-8000-000000000002');
  perform tests.eq(format($q$ select count(*) from public.company_access_state(%L) where state = 'trial' $q$, tests.id('company_c')), 1, 'new company is in trial');
  perform tests.as_user('c0000000-0000-4000-8000-000000000001');
  perform tests.throws(format($q$ select * from public.company_access_state(%L) $q$, tests.id('company_c')), 'outsiders cannot read access state', 'Not a member');
  perform tests.throws($q$ select public.record_payment_success('order_x', 'pay_x') $q$, 'users cannot mark payments paid', 'permission denied');
end $$;

-- Trial over -> locked
update public.companies set trial_ends_at = now() - interval '1 minute' where id = tests.id('company_c');
do $$ begin
  perform tests.as_user('f0000000-0000-4000-8000-000000000001');
  perform tests.eq(format($q$ select count(*) from public.company_access_state(%L) where state = 'locked' $q$, tests.id('company_c')), 1, 'expired trial is locked');
end $$;

-- Checkout: the server records the order, Razorpay confirms it
do $$
declare v_plan uuid;
begin
  select id into v_plan from public.subscription_plans where code = 'starter';
  perform tests.as_service();
  insert into public.payment_records (company_id, provider_order_id, amount_cents, currency, purpose, plan_id, billing_interval, setup_fee_cents, period_months)
  values (tests.id('company_c'), 'order_TEST1', 14900 + 29900, 'USD', 'subscription', v_plan, 'monthly', 29900, 1);
  perform tests.throws(format($q$ insert into public.payment_records (company_id, provider_order_id, amount_cents, currency, purpose) values (%L, 'order_BAD', 100, 'USD', 'subscription') $q$, tests.id('company_c')), 'subscription payments need plan and interval', 'check');

  perform public.record_payment_success('order_TEST1', 'pay_TEST1', 'card');
  perform public.record_payment_success('order_TEST1', 'pay_TEST1', 'card');  -- webhook repeats it

  perform tests.eq($q$ select count(*) from public.payment_records where provider_order_id = 'order_TEST1' and status = 'captured' and provider_payment_id = 'pay_TEST1' $q$, 1, 'payment captured');
  perform tests.eq(format($q$ select count(*) from public.invoices where company_id = %L $q$, tests.id('company_c')), 1, 'exactly one invoice despite repeated confirmation');
  perform tests.eq(format($q$ select count(*) from public.invoices where company_id = %L and total_cents = 44800 and jsonb_array_length(line_items) = 2 and number like 'CCO-%%' $q$, tests.id('company_c')), 1, 'invoice has plan and setup lines');
  perform tests.eq(format($q$ select count(*) from public.customer_subscriptions where company_id = %L and status = 'active' and current_period_end between now() + interval '27 days' and now() + interval '32 days' $q$, tests.id('company_c')), 1, 'one month of access');
  perform tests.eq(format($q$ select count(*) from public.companies where id = %L and status = 'active' $q$, tests.id('company_c')), 1, 'company activated');
  perform tests.throws($q$ select public.record_payment_success('order_UNKNOWN', 'pay_x') $q$, 'unknown orders are rejected', 'Unknown order');
end $$;

do $$ begin
  perform tests.as_user('f0000000-0000-4000-8000-000000000002');  -- viewer
  perform tests.eq(format($q$ select count(*) from public.company_access_state(%L) where state = 'active' and plan_code = 'starter' $q$, tests.id('company_c')), 1, 'paid company is active for every member');
  perform tests.eq($q$ select count(*) from public.invoices $q$, 0, 'viewers cannot read invoices');
  perform tests.as_user('f0000000-0000-4000-8000-000000000001');  -- owner
  perform tests.eq($q$ select count(*) from public.invoices $q$, 1, 'owner reads the invoice');
end $$;

-- Paying early for a year stacks on top of the running month
do $$
declare v_plan uuid;
begin
  select id into v_plan from public.subscription_plans where code = 'professional';
  perform tests.as_service();
  insert into public.payment_records (company_id, provider_order_id, amount_cents, currency, purpose, plan_id, billing_interval, period_months)
  values (tests.id('company_c'), 'order_TEST2', 449000, 'USD', 'subscription', v_plan, 'annual', 12);
  perform public.record_payment_success('order_TEST2', 'pay_TEST2', 'card');
  perform tests.eq(format($q$ select count(*) from public.customer_subscriptions where company_id = %L $q$, tests.id('company_c')), 1, 'still one subscription row');
  perform tests.eq(format($q$ select count(*) from public.customer_subscriptions where company_id = %L and current_period_end > now() + interval '12 months 27 days' and billing_interval = 'annual' $q$, tests.id('company_c')), 1, 'annual period added after the paid month');
end $$;

-- Lapsed subscription: 3-day grace, then locked
update public.customer_subscriptions set current_period_end = now() - interval '1 day' where company_id = tests.id('company_c');
do $$ begin
  perform tests.as_user('f0000000-0000-4000-8000-000000000001');
  perform tests.eq(format($q$ select count(*) from public.company_access_state(%L) where state = 'grace' $q$, tests.id('company_c')), 1, 'recently lapsed is in grace');
end $$;
update public.customer_subscriptions set current_period_end = now() - interval '4 days' where company_id = tests.id('company_c');
do $$ begin
  perform tests.as_user('f0000000-0000-4000-8000-000000000001');
  perform tests.eq(format($q$ select count(*) from public.company_access_state(%L) where state = 'locked' $q$, tests.id('company_c')), 1, 'lapsed beyond grace is locked');
end $$;

\echo 'All billing tests passed.'
