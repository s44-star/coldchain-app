-- =============================================================================
-- ColdChain OS · 0005_reporting_audit_notifications
-- =============================================================================

-- -----------------------------------------------------------------------------
-- reports — a record of every export
-- -----------------------------------------------------------------------------
create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  type         public.report_type not null,
  format       public.report_format not null default 'csv',
  filters      jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  date_from    timestamptz not null,
  date_to      timestamptz not null,
  timezone     text not null default 'UTC' check (private.is_valid_timezone(timezone)),
  row_count    integer check (row_count >= 0),
  generated_by uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  check (date_from < date_to)
);

create index reports_company_time_idx on public.reports (company_id, created_at desc);
create index reports_generated_by_idx on public.reports (generated_by);

-- -----------------------------------------------------------------------------
-- audit_logs — insert-only. No UPDATE/DELETE policies, privileges revoked,
-- and a trigger rejects direct UPDATE/DELETE (only a company deletion may
-- cascade into it).
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id            bigint generated always as identity primary key,
  company_id    uuid references public.companies (id) on delete cascade,
  actor_id      uuid,
  actor_email   text,
  action        text not null check (action ~ '^[a-z0-9_.]{2,80}$'),
  resource_type text not null check (char_length(resource_type) between 1 and 80),
  resource_id   text check (char_length(resource_id) <= 200),
  metadata      jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  ip            inet,
  user_agent    text check (char_length(user_agent) <= 512),
  created_at    timestamptz not null default now()
);

create index audit_logs_company_time_idx on public.audit_logs (company_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_resource_idx on public.audit_logs (resource_type, resource_id);

create or replace function private.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Depth 1 = a statement aimed directly at audit_logs. A cascade from a
  -- deleted company arrives through the FK trigger at depth >= 2.
  if pg_trigger_depth() < 2 then
    raise exception 'audit_logs is insert-only' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger audit_logs_no_update_delete
  before update or delete on public.audit_logs
  for each row execute function private.audit_logs_immutable();

create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function private.audit_logs_immutable();

-- -----------------------------------------------------------------------------
-- notifications — in-app, per user
-- -----------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null check (type ~ '^[a-z0-9_.]{2,60}$'),
  severity   public.alert_severity not null default 'info',
  title      text not null check (char_length(title) between 1 and 200),
  body       text check (char_length(body) <= 2000),
  link       text check (link ~ '^/[^/]' and char_length(link) <= 500),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
create index notifications_user_time_idx on public.notifications (user_id, created_at desc);
create index notifications_company_idx on public.notifications (company_id);

-- Users may only mark their notifications read.
create trigger notifications_guard_columns
  before update on public.notifications
  for each row execute function private.guard_immutable_columns(
    'id', 'company_id', 'user_id', 'type', 'severity', 'title', 'body', 'link', 'created_at'
  );

-- -----------------------------------------------------------------------------
-- notification_deliveries — outbox for e-mail / SMS. Rows are marked
-- provider_not_configured when no provider key exists, and the UI says so.
-- -----------------------------------------------------------------------------
create table public.notification_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id) on delete cascade,
  notification_id     uuid references public.notifications (id) on delete set null,
  user_id             uuid references public.profiles (id) on delete set null,
  channel             public.notification_channel not null,
  recipient           text not null check (char_length(recipient) <= 254),
  subject             text check (char_length(subject) <= 200),
  body                text not null check (char_length(body) <= 20000),
  status              public.delivery_status not null default 'pending',
  provider            text check (char_length(provider) <= 40),
  provider_message_id text check (char_length(provider_message_id) <= 200),
  attempts            integer not null default 0 check (attempts >= 0),
  last_error          text check (char_length(last_error) <= 2000),
  scheduled_at        timestamptz not null default now(),
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index notification_deliveries_pending_idx
  on public.notification_deliveries (scheduled_at) where status = 'pending';
create index notification_deliveries_company_idx on public.notification_deliveries (company_id, created_at desc);
create index notification_deliveries_notification_idx on public.notification_deliveries (notification_id);
create index notification_deliveries_user_idx on public.notification_deliveries (user_id);

create trigger notification_deliveries_set_updated_at
  before update on public.notification_deliveries
  for each row execute function private.set_updated_at();
