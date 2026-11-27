-- =============================================================================
-- Payments recorded by a super admin outside Razorpay.
-- =============================================================================

do $$
declare
  v_company uuid := 'd1000000-0000-4000-8000-0000000000a1';  -- India company from 70_india
  v_plan uuid;
  v_payment uuid;
begin
  select id into v_plan from public.subscription_plans where code = 'professional_in';

  perform tests.as_user('a0000000-0000-4000-8000-000000000001');
  perform tests.throws(format($q$ select public.admin_record_offline_payment(%L, %L, 'monthly', 1499900, 0, 'bank_transfer', 'UTR123') $q$, v_company, v_plan),
                       'company owners cannot record offline payments', 'super admin');

  perform tests.as_user('d0000000-0000-4000-8000-000000000001');
  perform tests.throws(format($q$ select public.admin_record_offline_payment(%L, %L, 'monthly', 1499900, 0, 'bank_transfer', 'x') $q$, v_company, v_plan),
                       'a reference is required', 'reference');
  perform tests.throws(format($q$ select public.admin_record_offline_payment(%L, %L, 'monthly', 100, 100, 'bank_transfer', 'UTR123') $q$, v_company, v_plan),
                       'setup fee cannot be the whole amount', 'setup fee');

  v_payment := public.admin_record_offline_payment(v_company, v_plan, 'annual', 14999000, 0, 'bank_transfer', 'UTR 4455 6677');

  perform tests.as_postgres();
  perform tests.eq(format($q$ select count(*) from public.payment_records where id = %L and provider = 'manual' and status = 'captured' and method = 'bank_transfer' and provider_payment_id = 'ref_UTR 4455 6677' and currency = 'INR' and created_by = 'd0000000-0000-4000-8000-000000000001' $q$, v_payment), 1, 'offline payment is recorded as captured');
  perform tests.eq(format($q$ select count(*) from public.invoices where payment_id = %L and total_cents = 14999000 and status = 'paid' $q$, v_payment), 1, 'offline payment issues an invoice');
  perform tests.eq(format($q$ select count(*) from public.customer_subscriptions s join public.subscription_plans p on p.id = s.plan_id where s.company_id = %L and p.code = 'professional_in' and s.current_period_end > now() + interval '12 months' $q$, v_company), 1, 'yearly payment extends the period after the one already paid');
  perform tests.eq($q$ select least(count(*), 1) from public.audit_logs where resource_type = 'payment_records' and actor_id = 'd0000000-0000-4000-8000-000000000001' $q$, 1, 'the audit log records who entered it');
end $$;

\echo 'All offline payment tests passed.'
