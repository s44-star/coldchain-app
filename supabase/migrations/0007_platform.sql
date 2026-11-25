-- =============================================================================
-- ColdChain OS · 0007_platform
-- Platform settings and database-backed rate limiting.
-- =============================================================================

create table public.app_settings (
  key         text primary key check (key ~ '^[a-z0-9_]{2,64}$'),
  value       jsonb not null,
  description text check (char_length(description) <= 300),
  -- public settings are readable by every signed-in user (e.g. trial length)
  is_public   boolean not null default false,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

create index app_settings_updated_by_idx on public.app_settings (updated_by);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function private.set_updated_at();

insert into public.app_settings (key, value, description, is_public) values
  ('trial_days', '14', 'Length of the free trial for new companies, in days', true),
  ('international_payments_enabled', 'false', 'Razorpay international payments activated on the merchant account', true),
  ('maintenance_mode', 'false', 'Show a maintenance banner and block writes from the app', true),
  ('reading_retention_months', '24', 'Raw sensor readings older than this are rolled into hourly aggregates', false),
  ('reading_future_tolerance_seconds', '300', 'Maximum accepted clock skew for device timestamps in the future', false),
  ('reading_past_tolerance_hours', '72', 'Oldest device timestamp accepted by the ingestion API', false)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- rate_limits — fixed-window counters that work across serverless instances
-- -----------------------------------------------------------------------------
create table public.rate_limits (
  key          text not null check (char_length(key) between 1 and 200),
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (key, window_start)
);

create index rate_limits_window_idx on public.rate_limits (window_start);

-- Returns true when the call is allowed, false when the limit is exceeded.
-- Callable only by the server (service role).
create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits   integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as rl (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = rl.hits + 1
  returning hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

-- Housekeeping for the cron job: remove windows older than a day.
create or replace function public.purge_rate_limits()
returns integer
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from public.rate_limits where window_start < now() - interval '1 day' returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.purge_rate_limits() from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
grant execute on function public.purge_rate_limits() to service_role;
