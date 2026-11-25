-- =============================================================================
-- ColdChain OS · 0014_checkout
-- Prepaid billing periods through Razorpay Orders: each payment buys one
-- month or one year (plus the one-time setup fee on the first payment).
-- Activation is a single idempotent database function, so the browser
-- callback and the webhook can both call it safely.
-- =============================================================================

alter table public.payment_records
  add column plan_id          uuid references public.subscription_plans (id) on delete restrict,
  add column billing_interval public.billing_interval,
  add column setup_fee_cents  integer not null default 0 check (setup_fee_cents >= 0),
  add column period_months    integer check (period_months in (1, 12));

alter table public.payment_records
  add constraint payment_records_subscription_details
  check (purpose <> 'subscription' or (plan_id is not null and billing_interval is not null and period_months is not null));

create index payment_records_plan_idx on public.payment_records (plan_id);

-- -----------------------------------------------------------------------------
-- record_payment_success — mark the order paid, extend the subscription,
-- activate the company and issue the invoice. Safe to call more than once.
-- -----------------------------------------------------------------------------
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
  where provider = 'razorpay' and provider_order_id = p_order_id
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
      v_payment.company_id, v_payment.plan_id, v_payment.billing_interval, 'razorpay', 'active', now(), v_end
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

-- -----------------------------------------------------------------------------
-- company_access_state — what the paywall checks. Members may ask for their
-- own company; nobody else.
--   active  paid period running
--   grace   paid period ended less than 3 days ago (banner, still usable)
--   trial   free trial running
--   locked  trial over or subscription lapsed: only billing is reachable
-- -----------------------------------------------------------------------------
create or replace function public.company_access_state(p_company_id uuid)
returns table (state text, ends_at timestamptz, plan_code text, plan_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company public.companies%rowtype;
  v_end     timestamptz;
  v_code    text;
  v_name    text;
begin
  if not (private.is_company_member(p_company_id) or private.is_platform_admin()) then
    raise exception 'Not a member of this company' using errcode = '42501';
  end if;

  select * into v_company from public.companies where id = p_company_id;

  select s.current_period_end, p.code, p.name into v_end, v_code, v_name
  from public.customer_subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.company_id = p_company_id
  order by s.current_period_end desc nulls last
  limit 1;

  if v_company.status in ('suspended', 'cancelled') then
    return query select 'locked'::text, v_end, v_code, v_name;
  elsif v_company.is_demo then
    return query select 'active'::text, null::timestamptz, v_code, v_name;
  elsif v_end is not null and v_end > now() then
    return query select 'active'::text, v_end, v_code, v_name;
  elsif v_end is not null and v_end > now() - interval '3 days' then
    return query select 'grace'::text, v_end + interval '3 days', v_code, v_name;
  elsif v_company.status = 'trial' and v_company.trial_ends_at > now() then
    return query select 'trial'::text, v_company.trial_ends_at, null::text, null::text;
  else
    return query select 'locked'::text, coalesce(v_end, v_company.trial_ends_at), v_code, v_name;
  end if;
end;
$$;

revoke all on function public.record_payment_success(text, text, text) from public, anon, authenticated;
grant execute on function public.record_payment_success(text, text, text) to service_role;

revoke all on function public.company_access_state(uuid) from public, anon;
grant execute on function public.company_access_state(uuid) to authenticated, service_role;
