-- =============================================================================
-- ColdChain OS · 0006_billing
-- Amounts are stored as integer minor units (cents) to avoid rounding errors.
-- Prices live only in subscription_plans and are edited from the super admin.
-- =============================================================================

create table public.subscription_plans (
  id                       uuid primary key default gen_random_uuid(),
  code                     text not null unique check (code ~ '^[a-z0-9_]{2,32}$'),
  name                     text not null check (char_length(name) between 2 and 60),
  description              text check (char_length(description) <= 500),
  currency                 char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  monthly_price_cents      integer check (monthly_price_cents >= 0),
  annual_price_cents       integer check (annual_price_cents >= 0),
  setup_fee_cents          integer not null default 0 check (setup_fee_cents >= 0),
  -- null = unlimited
  max_warehouses           integer check (max_warehouses > 0),
  max_zones                integer check (max_zones > 0),
  max_sensors              integer check (max_sensors > 0),
  max_users                integer check (max_users > 0),
  features                 jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  razorpay_plan_id_monthly text check (char_length(razorpay_plan_id_monthly) <= 64),
  razorpay_plan_id_annual  text check (char_length(razorpay_plan_id_annual) <= 64),
  is_active                boolean not null default true,
  is_public                boolean not null default true,
  -- true = "contact sales" instead of self-serve checkout
  requires_contact         boolean not null default false,
  sort_order               integer not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create trigger subscription_plans_set_updated_at
  before update on public.subscription_plans
  for each row execute function private.set_updated_at();

create table public.customer_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references public.companies (id) on delete cascade,
  plan_id                  uuid not null references public.subscription_plans (id) on delete restrict,
  billing_interval         public.billing_interval not null,
  provider                 text not null default 'razorpay' check (provider ~ '^[a-z0-9_]{2,20}$'),
  provider_subscription_id text check (char_length(provider_subscription_id) <= 64),
  provider_customer_id     text check (char_length(provider_customer_id) <= 64),
  provider_plan_id         text check (char_length(provider_plan_id) <= 64),
  status                   public.subscription_status not null default 'incomplete',
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  cancelled_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (id, company_id),
  unique (provider, provider_subscription_id)
);

-- At most one live subscription per company.
create unique index customer_subscriptions_live_idx
  on public.customer_subscriptions (company_id)
  where status in ('incomplete', 'trialing', 'active', 'past_due', 'paused');
create index customer_subscriptions_company_idx on public.customer_subscriptions (company_id, created_at desc);
create index customer_subscriptions_plan_idx on public.customer_subscriptions (plan_id);

create trigger customer_subscriptions_set_updated_at
  before update on public.customer_subscriptions
  for each row execute function private.set_updated_at();

create table public.payment_records (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id) on delete cascade,
  subscription_id     uuid,
  provider            text not null default 'razorpay' check (provider ~ '^[a-z0-9_]{2,20}$'),
  provider_order_id   text check (char_length(provider_order_id) <= 64),
  provider_payment_id text check (char_length(provider_payment_id) <= 64),
  amount_cents        integer not null check (amount_cents > 0),
  currency            char(3) not null check (currency ~ '^[A-Z]{3}$'),
  purpose             public.payment_purpose not null,
  status              public.payment_status not null default 'created',
  method              text check (char_length(method) <= 40),
  failure_reason      text check (char_length(failure_reason) <= 500),
  captured_at         timestamptz,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, company_id),
  unique (provider, provider_order_id),
  unique (provider, provider_payment_id),
  foreign key (subscription_id, company_id)
    references public.customer_subscriptions (id, company_id) on delete set null (subscription_id)
);

create index payment_records_company_idx on public.payment_records (company_id, created_at desc);
create index payment_records_subscription_idx on public.payment_records (subscription_id, company_id);
create index payment_records_created_by_idx on public.payment_records (created_by);

create trigger payment_records_set_updated_at
  before update on public.payment_records
  for each row execute function private.set_updated_at();

create table public.refunds (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null,
  payment_id         uuid not null,
  amount_cents       integer not null check (amount_cents > 0),
  currency           char(3) not null check (currency ~ '^[A-Z]{3}$'),
  reason             text check (char_length(reason) <= 500),
  provider_refund_id text unique check (char_length(provider_refund_id) <= 64),
  status             public.refund_status not null default 'pending',
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (payment_id, company_id) references public.payment_records (id, company_id) on delete cascade
);

create index refunds_payment_idx on public.refunds (payment_id, company_id);
create index refunds_company_idx on public.refunds (company_id);
create index refunds_created_by_idx on public.refunds (created_by);

create trigger refunds_set_updated_at
  before update on public.refunds
  for each row execute function private.set_updated_at();

-- Sequential, gap-tolerant invoice numbers: CCO-2026-000001
create sequence public.invoice_number_seq as bigint start 1;

create table public.invoices (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete cascade,
  payment_id       uuid,
  number           text not null unique
                   default ('CCO-' || to_char(now() at time zone 'UTC', 'YYYY') || '-' ||
                            lpad(nextval('public.invoice_number_seq')::text, 6, '0')),
  currency         char(3) not null check (currency ~ '^[A-Z]{3}$'),
  line_items       jsonb not null default '[]'::jsonb check (jsonb_typeof(line_items) = 'array'),
  subtotal_cents   integer not null check (subtotal_cents >= 0),
  tax_cents        integer not null default 0 check (tax_cents >= 0),
  total_cents      integer not null check (total_cents >= 0),
  -- Company name, address and VAT number frozen at the time of issue
  billing_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(billing_snapshot) = 'object'),
  status           public.invoice_status not null default 'issued',
  issued_at        timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (total_cents = subtotal_cents + tax_cents),
  foreign key (payment_id, company_id)
    references public.payment_records (id, company_id) on delete set null (payment_id)
);

create index invoices_company_idx on public.invoices (company_id, issued_at desc);
create index invoices_payment_idx on public.invoices (payment_id, company_id);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function private.set_updated_at();

-- Raw webhook events, keyed by provider event id for idempotency.
create table public.payment_webhook_events (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null default 'razorpay' check (provider ~ '^[a-z0-9_]{2,20}$'),
  event_id        text not null check (char_length(event_id) between 1 and 128),
  event_type      text not null check (char_length(event_type) between 1 and 80),
  payload         jsonb not null,
  signature_valid boolean not null,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  error           text check (char_length(error) <= 2000),
  unique (provider, event_id)
);

create index payment_webhook_events_unprocessed_idx
  on public.payment_webhook_events (received_at) where processed_at is null;
