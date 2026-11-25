-- =============================================================================
-- ColdChain OS · stage-3 database changes (generated — do not edit)
-- Paste into Supabase → SQL Editor → Run, once. Run earlier stages first.
-- =============================================================================

-- >>> 0015_monitoring.sql
-- =============================================================================
-- ColdChain OS · 0015_monitoring
-- Reading ingestion with the alert engine, the offline sweep, and simulated
-- readings for demos. Everything that decides whether an alert exists runs
-- here, in one transaction per batch, so the app and devices cannot disagree.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Raise a new alert, or count a repeat on the one already open.
-- Notifies everyone in the company except viewers when an alert is new.
-- -----------------------------------------------------------------------------
create or replace function private.raise_alert(
  p_company_id   uuid,
  p_warehouse_id uuid,
  p_zone_id      uuid,
  p_sensor_id    uuid,
  p_type         public.alert_type,
  p_severity     public.alert_severity,
  p_dedupe_key   text,
  p_title        text,
  p_message      text,
  p_reading_id   bigint,
  p_observed     numeric,
  p_threshold    numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alert public.alerts%rowtype;
begin
  select * into v_alert
  from public.alerts
  where company_id = p_company_id and dedupe_key = p_dedupe_key and status <> 'resolved'
  for update;

  if found then
    update public.alerts
    set trigger_count     = trigger_count + 1,
        last_triggered_at = now(),
        reading_id        = coalesce(p_reading_id, reading_id),
        observed_value    = coalesce(p_observed, observed_value),
        -- escalate, never downgrade
        severity = case when p_severity = 'critical' then 'critical'::public.alert_severity else severity end
    where id = v_alert.id;
    return v_alert.id;
  end if;

  insert into public.alerts (
    company_id, warehouse_id, zone_id, sensor_id, type, severity, dedupe_key, title, message,
    reading_id, observed_value, threshold_value
  ) values (
    p_company_id, p_warehouse_id, p_zone_id, p_sensor_id, p_type, p_severity, p_dedupe_key,
    left(p_title, 200), left(p_message, 2000), p_reading_id, p_observed, p_threshold
  )
  returning * into v_alert;

  insert into public.notifications (company_id, user_id, type, severity, title, body, link)
  select p_company_id, m.user_id, 'alert.created', p_severity, left(p_title, 200), left(p_message, 2000),
         '/app/alerts/' || v_alert.id
  from public.company_members m
  where m.company_id = p_company_id and m.role <> 'viewer';

  return v_alert.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Check one reading against its zone's limits.
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
      format('%s%s above %s °C', v_prefix, z.name, z.max_temp_c),
      format('%s °C recorded at %s UTC; limit is %s °C.', r.temperature_c, to_char(r.recorded_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), z.max_temp_c),
      r.id, r.temperature_c, z.max_temp_c);
    v_count := v_count + 1;
  elsif r.temperature_c is not null and z.min_temp_c is not null and r.temperature_c < z.min_temp_c then
    perform private.raise_alert(
      r.company_id, r.warehouse_id, r.zone_id, r.sensor_id, 'temperature_low',
      case when z.min_temp_c - r.temperature_c > c.critical_temp_excursion_c then 'critical' else 'warning' end::public.alert_severity,
      'zone:' || z.id || ':temperature_low',
      format('%s%s below %s °C', v_prefix, z.name, z.min_temp_c),
      format('%s °C recorded at %s UTC; limit is %s °C.', r.temperature_c, to_char(r.recorded_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), z.min_temp_c),
      r.id, r.temperature_c, z.min_temp_c);
    v_count := v_count + 1;
  end if;

  if r.humidity_pct is not null and z.max_humidity_pct is not null and r.humidity_pct > z.max_humidity_pct then
    perform private.raise_alert(
      r.company_id, r.warehouse_id, r.zone_id, r.sensor_id, 'humidity_high',
      case when r.humidity_pct - z.max_humidity_pct > c.critical_humidity_excursion then 'critical' else 'warning' end::public.alert_severity,
      'zone:' || z.id || ':humidity_high',
      format('%s%s humidity above %s %%', v_prefix, z.name, z.max_humidity_pct),
      format('%s %%RH recorded; limit is %s %%RH.', r.humidity_pct, z.max_humidity_pct),
      r.id, r.humidity_pct, z.max_humidity_pct);
    v_count := v_count + 1;
  elsif r.humidity_pct is not null and z.min_humidity_pct is not null and r.humidity_pct < z.min_humidity_pct then
    perform private.raise_alert(
      r.company_id, r.warehouse_id, r.zone_id, r.sensor_id, 'humidity_low',
      case when z.min_humidity_pct - r.humidity_pct > c.critical_humidity_excursion then 'critical' else 'warning' end::public.alert_severity,
      'zone:' || z.id || ':humidity_low',
      format('%s%s humidity below %s %%', v_prefix, z.name, z.min_humidity_pct),
      format('%s %%RH recorded; limit is %s %%RH.', r.humidity_pct, z.min_humidity_pct),
      r.id, r.humidity_pct, z.min_humidity_pct);
    v_count := v_count + 1;
  end if;

  return v_count;
end;
$$;

-- Manual readings (entered in the app) go through the same alert check.
create or replace function private.evaluate_manual_reading()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.evaluate_reading(new.id);
  return null;
end;
$$;

create trigger sensor_readings_evaluate_manual
  after insert on public.sensor_readings
  for each row when (new.source = 'manual')
  execute function private.evaluate_manual_reading();

-- -----------------------------------------------------------------------------
-- ingest_readings — called by the ingestion API (after the device key is
-- verified) and by the simulator. p_readings is a JSON array of
--   { "recorded_at": ISO-8601, "temperature_c": number, "humidity_pct": number }
-- Returns { accepted, duplicates, rejected, alerts }.
-- -----------------------------------------------------------------------------
create or replace function public.ingest_readings(
  p_sensor_id uuid,
  p_readings  jsonb,
  p_source    public.reading_source default 'device'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s            public.sensors%rowtype;
  item         jsonb;
  v_at         timestamptz;
  v_temp       numeric;
  v_hum        numeric;
  v_quality    public.reading_quality;
  v_id         bigint;
  v_accepted   integer := 0;
  v_duplicates integer := 0;
  v_rejected   integer := 0;
  v_alerts     integer := 0;
  v_latest     timestamptz;
  v_future     interval;
  v_past       interval;
begin
  if jsonb_typeof(p_readings) <> 'array' or jsonb_array_length(p_readings) > 500 then
    raise exception 'readings must be an array of at most 500 items' using errcode = '22023';
  end if;

  select * into s from public.sensors where id = p_sensor_id for update;
  if not found or s.archived_at is not null or s.status = 'retired' then
    raise exception 'Sensor not found or retired' using errcode = 'P0002';
  end if;

  select make_interval(secs => coalesce((select (value #>> '{}')::integer from public.app_settings where key = 'reading_future_tolerance_seconds'), 300)),
         make_interval(hours => coalesce((select (value #>> '{}')::integer from public.app_settings where key = 'reading_past_tolerance_hours'), 72))
    into v_future, v_past;

  for item in select * from jsonb_array_elements(p_readings) loop
    begin
      v_at   := (item ->> 'recorded_at')::timestamptz;
      v_temp := (item ->> 'temperature_c')::numeric;
      v_hum  := (item ->> 'humidity_pct')::numeric;
    exception when others then
      v_rejected := v_rejected + 1;
      continue;
    end;

    if v_at is null or (v_temp is null and v_hum is null)
       or v_at > now() + v_future or v_at < now() - v_past
       or abs(coalesce(v_temp, 0)) >= 10000 or abs(coalesce(v_hum, 0)) >= 10000 then
      v_rejected := v_rejected + 1;
      continue;
    end if;

    v_quality := case
      when (v_temp is not null and v_temp not between -90 and 60) or (v_hum is not null and v_hum not between 0 and 100)
        then 'invalid'
      else 'ok'
    end;

    insert into public.sensor_readings (company_id, warehouse_id, zone_id, sensor_id, recorded_at, temperature_c, humidity_pct, source, quality)
    values (s.company_id, s.warehouse_id, s.zone_id, s.id, v_at, round(v_temp, 2), round(v_hum, 2), p_source, v_quality)
    on conflict (sensor_id, recorded_at) do nothing
    returning id into v_id;

    if v_id is null then
      v_duplicates := v_duplicates + 1;
    else
      v_accepted := v_accepted + 1;
      v_latest := greatest(v_latest, v_at);
      v_alerts := v_alerts + private.evaluate_reading(v_id);
    end if;
    v_id := null;
  end loop;

  update public.sensors
  set last_seen_at    = now(),
      last_reading_at = greatest(last_reading_at, v_latest),
      status          = case when status in ('registered', 'offline') and v_latest is not null then 'active'::public.sensor_status else status end
  where id = s.id;

  return jsonb_build_object('accepted', v_accepted, 'duplicates', v_duplicates, 'rejected', v_rejected, 'alerts', v_alerts);
end;
$$;

-- -----------------------------------------------------------------------------
-- sweep_sensors — run every few minutes (pg_cron). Sensors that have missed
-- their expected readings go offline and raise an alert.
-- Expected gap = zone interval × company missing_reading_factor (default 2×).
-- -----------------------------------------------------------------------------
create or replace function public.sweep_sensors()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec     record;
  v_count integer := 0;
begin
  for rec in
    select s.*, z.name as zone_name, z.monitoring_interval_minutes, c.missing_reading_factor
    from public.sensors s
    join public.companies c on c.id = s.company_id
    left join public.storage_zones z on z.id = s.zone_id
    where s.status = 'active'
      and s.archived_at is null
      and c.status not in ('suspended', 'cancelled')
      and coalesce(s.last_reading_at, s.created_at)
          < now() - make_interval(mins => ceil(coalesce(z.monitoring_interval_minutes, 5) * c.missing_reading_factor)::integer)
    for update of s skip locked
  loop
    update public.sensors set status = 'offline' where id = rec.id;
    perform private.raise_alert(
      rec.company_id, rec.warehouse_id, rec.zone_id, rec.id, 'sensor_offline', 'warning',
      'sensor:' || rec.id || ':offline',
      format('%s stopped reporting', rec.name),
      format('No reading since %s UTC%s.',
             coalesce(to_char(rec.last_reading_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), 'registration'),
             case when rec.zone_name is not null then ' in ' || rec.zone_name else '' end),
      null, null, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- simulate_readings — demo data for a sensor, always marked 'simulated'.
-- Generates p_hours of 5-minute readings inside the zone's limits; when
-- p_excursion is set the last reading goes past the upper limit.
-- -----------------------------------------------------------------------------
create or replace function public.simulate_readings(p_sensor_id uuid, p_hours integer default 24, p_excursion boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s      public.sensors%rowtype;
  z      public.storage_zones%rowtype;
  v_mid  numeric;
  v_amp  numeric;
  v_hmid numeric;
  v_rows jsonb := '[]'::jsonb;
  v_t    timestamptz;
  i      integer;
  n      integer;
begin
  select * into s from public.sensors where id = p_sensor_id;
  if not found then
    raise exception 'Sensor not found' using errcode = 'P0002';
  end if;
  if not private.can_manage_warehouse(s.warehouse_id) then
    raise exception 'Only managers of this warehouse can generate simulated data' using errcode = '42501';
  end if;
  if s.zone_id is null then
    raise exception 'Place the sensor in a zone first' using errcode = '22023';
  end if;
  if p_hours not between 1 and 48 then
    raise exception 'Choose between 1 and 48 hours' using errcode = '22023';
  end if;

  select * into z from public.storage_zones where id = s.zone_id;
  v_mid  := coalesce((z.min_temp_c + z.max_temp_c) / 2, z.max_temp_c - 2, z.min_temp_c + 2, 4);
  v_amp  := coalesce((z.max_temp_c - z.min_temp_c) / 5, 0.6);
  v_hmid := coalesce((z.min_humidity_pct + z.max_humidity_pct) / 2, 60);
  n := p_hours * 12;

  for i in 0 .. n - 1 loop
    v_t := date_trunc('minute', now()) - make_interval(mins => (n - 1 - i) * 5);
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'recorded_at', v_t,
      'temperature_c', round((v_mid + v_amp * sin(i / 7.6) + (random() - 0.5) * v_amp * 0.3)::numeric, 2),
      'humidity_pct', round(least(99, greatest(1, v_hmid + 4 * sin(i / 23.0) + (random() - 0.5) * 2))::numeric, 1)
    ));
  end loop;

  if p_excursion and z.max_temp_c is not null then
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'recorded_at', date_trunc('minute', now()) + interval '30 seconds',
      'temperature_c', z.max_temp_c + 1.5,
      'humidity_pct', v_hmid
    ));
  end if;

  return public.ingest_readings(p_sensor_id, v_rows, 'simulated');
end;
$$;

revoke all on function private.raise_alert(uuid, uuid, uuid, uuid, public.alert_type, public.alert_severity, text, text, text, bigint, numeric, numeric) from public;
revoke all on function private.evaluate_reading(bigint) from public;
revoke all on function public.ingest_readings(uuid, jsonb, public.reading_source) from public, anon, authenticated;
revoke all on function public.sweep_sensors() from public, anon, authenticated;
revoke all on function public.simulate_readings(uuid, integer, boolean) from public, anon;
grant execute on function public.ingest_readings(uuid, jsonb, public.reading_source) to service_role;
grant execute on function public.sweep_sensors() to service_role;
grant execute on function public.simulate_readings(uuid, integer, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Schedule the sweep every 5 minutes with pg_cron when it is available
-- (Supabase: Database → Extensions → pg_cron). Safe to run without it.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; schedule public.sweep_sensors() every 5 minutes another way';
    return;
  end if;
  begin
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'coldchain-sweep-sensors';
    perform cron.schedule('coldchain-sweep-sensors', '*/5 * * * *', 'select public.sweep_sensors()');
    perform cron.unschedule(jobid) from cron.job where jobname = 'coldchain-purge-rate-limits';
    perform cron.schedule('coldchain-purge-rate-limits', '17 3 * * *', 'select public.purge_rate_limits()');
  exception when others then
    raise notice 'Could not schedule with pg_cron (%). Enable pg_cron in Database → Extensions and run this block again.', sqlerrm;
  end;
end;
$$;
