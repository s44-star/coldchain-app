-- =============================================================================
-- ColdChain OS · 0021_offline_payments
-- Payments received outside Razorpay (bank transfer, UPI to the bank account,
-- cash, cheque) are recorded by a super admin. They activate the plan and
-- issue the invoice through the same function as online payments.
-- =============================================================================

create or replace function public.record_payment_success(
  p_order_id   text,
  p_payment_id text,
  p_method     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payment_records%rowtype;
  v_plan    public.subscription_plans%rowtype;
  v_company public.companies%rowtype;
  v_sub     public.customer_subscriptions%rowtype;
  v_sub_id  uuid;
  v_start   timestamptz;
  v_end     timestamptz;
  v_lines   jsonb;
begin
  select * into v_payment
  from public.payment_records
  where provider in ('razorpay', 'manual') and provider_order_id = p_order_id
  for update;

  if not found then
    raise exception 'Unknown order %', p_order_id using errcode = 'P0002';
  end if;

  -- Already processed (browser callback and webhook both arrive): no-op.
  if v_payment.status = 'captured' then
    return v_payment.id;
  end if;

  select * into v_plan from public.subscription_plans where id = v_payment.plan_id;
  select * into v_company from public.companies where id = v_payment.company_id for update;

  select * into v_sub
  from public.customer_subscriptions
  where company_id = v_payment.company_id
    and status in ('incomplete', 'trialing', 'active', 'past_due', 'paused')
  for update;

  -- Paying early adds the new period after the one already paid for.
  v_start := greatest(now(), coalesce(v_sub.current_period_end, now()));
  v_end := v_start + make_interval(months => v_payment.period_months);

  if v_sub.id is null then
    insert into public.customer_subscriptions (
      company_id, plan_id, billing_interval, provider, status, current_period_start, current_period_end
    ) values (
      v_payment.company_id, v_payment.plan_id, v_payment.billing_interval, v_payment.provider, 'active', now(), v_end
    )
    returning id into v_sub_id;
  else
    update public.customer_subscriptions
    set plan_id              = v_payment.plan_id,
        billing_interval     = v_payment.billing_interval,
        status               = 'active',
        current_period_start = case when current_period_end > now() then current_period_start else now() end,
        current_period_end   = v_end,
        cancel_at_period_end = false
    where id = v_sub.id;
    v_sub_id := v_sub.id;
  end if;

  update public.payment_records
  set status = 'captured',
      provider_payment_id = p_payment_id,
      method = left(p_method, 40),
      captured_at = now(),
      subscription_id = v_sub_id
  where id = v_payment.id;

  update public.companies set status = 'active' where id = v_payment.company_id;

  v_lines := jsonb_build_array(jsonb_build_object(
    'description', format('ColdChain OS %s plan, %s', v_plan.name,
                          case v_payment.billing_interval when 'annual' then '12 months' else '1 month' end),
    'period_start', v_start,
    'period_end', v_end,
    'amount_cents', v_payment.amount_cents - v_payment.setup_fee_cents
  ));
  if v_payment.setup_fee_cents > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'description', 'One-time setup and onboarding',
      'amount_cents', v_payment.setup_fee_cents
    ));
  end if;

  insert into public.invoices (
    company_id, payment_id, currency, line_items, subtotal_cents, tax_cents, total_cents, billing_snapshot, status
  ) values (
    v_payment.company_id, v_payment.id, v_payment.currency, v_lines,
    v_payment.amount_cents, 0, v_payment.amount_cents,
    jsonb_strip_nulls(jsonb_build_object(
      'name', v_company.name,
      'country_code', v_company.country_code,
      'vat_number', v_company.vat_number,
      'registration_number', v_company.registration_number,
      'billing_email', v_company.billing_email,
      'address_line1', v_company.address_line1,
      'address_line2', v_company.address_line2,
      'city', v_company.city,
      'postal_code', v_company.postal_code
    )),
    'paid'
  );

  return v_payment.id;
end;
$$;

revoke all on function public.record_payment_success(text, text, text) from public, anon, authenticated;
grant execute on function public.record_payment_success(text, text, text) to service_role;

create or replace function public.admin_record_offline_payment(
  p_company_id      uuid,
  p_plan_id         uuid,
  p_interval        public.billing_interval,
  p_amount_cents    integer,
  p_setup_fee_cents integer,
  p_method          text,
  p_reference       text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan  public.subscription_plans%rowtype;
  v_order text;
begin
  if not private.is_platform_admin() then
    raise exception 'Only a super admin can record payments' using errcode = '42501';
  end if;

  select * into v_plan from public.subscription_plans where id = p_plan_id;
  if not found then
    raise exception 'Unknown plan' using errcode = '22023';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Unknown company' using errcode = '22023';
  end if;
  if coalesce(p_amount_cents, 0) <= 0 or coalesce(p_setup_fee_cents, 0) < 0 or p_setup_fee_cents >= p_amount_cents then
    raise exception 'Amount must be above zero and above the setup fee' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_reference, ''))) not between 3 and 50 then
    raise exception 'Enter the bank or UPI reference (3 to 50 characters)' using errcode = '22023';
  end if;
  if p_method not in ('bank_transfer', 'upi', 'cash', 'cheque', 'other') then
    raise exception 'Unknown payment method' using errcode = '22023';
  end if;

  v_order := 'manual_' || left(replace(gen_random_uuid()::text, '-', ''), 24);

  insert into public.payment_records (
    company_id, provider, provider_order_id, amount_cents, currency, purpose,
    plan_id, billing_interval, setup_fee_cents, period_months, created_by
  ) values (
    p_company_id, 'manual', v_order, p_amount_cents, v_plan.currency, 'subscription',
    p_plan_id, p_interval, p_setup_fee_cents, case when p_interval = 'annual' then 12 else 1 end,
    (select auth.uid())
  );

  return public.record_payment_success(v_order, left('ref_' || trim(p_reference), 64), p_method);
end;
$$;

revoke all on function public.admin_record_offline_payment(uuid, uuid, public.billing_interval, integer, integer, text, text) from public, anon;
grant execute on function public.admin_record_offline_payment(uuid, uuid, public.billing_interval, integer, integer, text, text) to authenticated;
