-- =============================================================================
-- ColdChain OS · stage-5 database changes (generated — do not edit)
-- Paste into Supabase → SQL Editor → Run, once. Run earlier stages first.
-- =============================================================================

-- >>> 0017_alert_delivery.sql
-- =============================================================================
-- ColdChain OS · 0017_alert_delivery
-- E-mail delivery for alerts: every new alert notification is queued per
-- person (unless they opted out); the app's delivery worker sends the queue.
-- pg_cron + pg_net call the worker every minute once it is configured.
-- Also: alert texts show "8 °C" instead of "8.00 °C".
-- =============================================================================

alter table public.profiles
  add column email_alerts boolean not null default true;

-- Queue an e-mail for each new alert notification.
create or replace function private.queue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles%rowtype;
begin
  if new.type <> 'alert.created' then
    return null;
  end if;
  select * into p from public.profiles where id = new.user_id;
  if not found or not p.email_alerts or p.email like '%@users.invalid' then
    return null;
  end if;

  insert into public.notification_deliveries (company_id, notification_id, user_id, channel, recipient, subject, body)
  values (
    new.company_id, new.id, new.user_id, 'email', p.email,
    left(case new.severity when 'critical' then '[Critical] ' when 'warning' then '[Warning] ' else '' end || new.title, 200),
    coalesce(new.body, new.title) || E'\n\n' || coalesce(new.link, '/app/alerts')
  );
  return null;
end;
$$;

create trigger notifications_queue_email
  after insert on public.notifications
  for each row execute function private.queue_notification_email();

-- The worker claims a batch atomically, so parallel runs never send twice.
create or replace function public.claim_deliveries(p_limit integer default 50)
returns setof public.notification_deliveries
language sql
security definer
set search_path = ''
as $$
  update public.notification_deliveries d
  set attempts = d.attempts + 1,
      scheduled_at = now() + interval '10 minutes'  -- lease; reset on result
  where d.id in (
    select id from public.notification_deliveries
    where status = 'pending' and scheduled_at <= now() and attempts < 5
    order by scheduled_at
    limit least(greatest(p_limit, 1), 200)
    for update skip locked
  )
  returning d.*;
$$;

revoke all on function public.claim_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_deliveries(integer) to service_role;

-- Calls the app's delivery worker. Needs two settings (set them once):
--   delivery_worker_url  e.g. https://coldchain-app-z971.vercel.app/api/cron/deliver
--   cron_secret          the same value as CRON_SECRET in Vercel
create or replace function private.kick_delivery_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text := (select value #>> '{}' from public.app_settings where key = 'delivery_worker_url');
  v_secret text := (select value #>> '{}' from public.app_settings where key = 'cron_secret');
begin
  if v_url is null or v_secret is null then
    return;
  end if;
  if not exists (
    select 1 from public.notification_deliveries where status = 'pending' and scheduled_at <= now() and attempts < 5
  ) then
    return;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 10000)'
    using v_url,
          jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
          '{}'::jsonb;
end;
$$;

revoke all on function private.kick_delivery_worker() from public;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron or pg_net not available; call /api/cron/deliver every minute another way';
    return;
  end if;
  begin
    create extension if not exists pg_net;
    perform cron.unschedule(jobid) from cron.job where jobname = 'coldchain-deliver';
    perform cron.schedule('coldchain-deliver', '* * * * *', 'select private.kick_delivery_worker()');
  exception when others then
    raise notice 'Could not schedule delivery (%). Enable pg_cron and pg_net, then run this block again.', sqlerrm;
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- Alert texts without trailing zeros ("8 °C", not "8.00 °C")
-- -----------------------------------------------------------------------------
create or replace function private.evaluate_reading(p_reading_id bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r        public.sensor_readings%rowtype;
  z        public.storage_zones%rowtype;
  c        public.companies%rowtype;
  v_prefix text;
  v_count  integer := 0;
begin
  select * into r from public.sensor_readings where id = p_reading_id;
  if not found or r.zone_id is null or r.quality = 'invalid' then
    return 0;
  end if;
  select * into z from public.storage_zones where id = r.zone_id;
  if z.archived_at is not null then
    return 0;
  end if;
  select * into c from public.companies where id = r.company_id;
  v_prefix := case when r.source = 'simulated' then 'Simulated: ' else '' end;

  if r.temperature_c is not null and z.max_temp_c is not null and r.temperature_c > z.max_temp_c then
    perform private.raise_alert(
      r.company_id, r.warehouse_id, r.zone_id, r.sensor_id, 'temperature_high',
      case when r.temperature_c - z.max_temp_c > c.critical_temp_excursion_c then 'critical' else 'warning' end::public.alert_severity,
      'zone:' || z.id || ':temperature_high',
      format('%s%s above %s °C', v_prefix, z.name, trim_scale(z.max_temp_c)),
      format('%s °C recorded at %s UTC; limit is %s °C.', trim_scale(r.temperature_c), to_char(r.recorded_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), trim_scale(z.max_temp_c)),
      r.id, r.temperature_c, z.max_temp_c);
    v_count := v_count + 1;
  elsif r.temperature_c is not null and z.min_temp_c is not null and r.temperature_c < z.min_temp_c then
    perform private.raise_alert(
      r.company_id, r.warehouse_id, r.zone_id, r.sensor_id, 'temperature_low',
      case when z.min_temp_c - r.temperature_c > c.critical_temp_excursion_c then 'critical' else 'warning' end::public.alert_severity,
      'zone:' || z.id || ':temperature_low',
      format('%s%s below %s °C', v_prefix, z.name, trim_scale(z.min_temp_c)),
      format('%s °C recorded at %s UTC; limit is %s °C.', trim_scale(r.temperature_c), to_char(r.recorded_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), trim_scale(z.min_temp_c)),
      r.id, r.temperature_c, z.min_temp_c);
    v_count := v_count + 1;
  end if;

  if r.humidity_pct is not null and z.max_humidity_pct is not null and r.humidity_pct > z.max_humidity_pct then
    perform private.raise_alert(
      r.company_id, r.warehouse_id, r.zone_id, r.sensor_id, 'humidity_high',
      case when r.humidity_pct - z.max_humidity_pct > c.critical_humidity_excursion then 'critical' else 'warning' end::public.alert_severity,
      'zone:' || z.id || ':humidity_high',
      format('%s%s humidity above %s %%', v_prefix, z.name, trim_scale(z.max_humidity_pct)),
      format('%s %%RH recorded; limit is %s %%RH.', trim_scale(r.humidity_pct), trim_scale(z.max_humidity_pct)),
      r.id, r.humidity_pct, z.max_humidity_pct);
    v_count := v_count + 1;
  elsif r.humidity_pct is not null and z.min_humidity_pct is not null and r.humidity_pct < z.min_humidity_pct then
    perform private.raise_alert(
      r.company_id, r.warehouse_id, r.zone_id, r.sensor_id, 'humidity_low',
      case when z.min_humidity_pct - r.humidity_pct > c.critical_humidity_excursion then 'critical' else 'warning' end::public.alert_severity,
      'zone:' || z.id || ':humidity_low',
      format('%s%s humidity below %s %%', v_prefix, z.name, trim_scale(z.min_humidity_pct)),
      format('%s %%RH recorded; limit is %s %%RH.', trim_scale(r.humidity_pct), trim_scale(z.min_humidity_pct)),
      r.id, r.humidity_pct, z.min_humidity_pct);
    v_count := v_count + 1;
  end if;

  return v_count;
end;
$$;
