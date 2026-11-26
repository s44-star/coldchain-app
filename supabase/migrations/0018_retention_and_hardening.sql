-- =============================================================================
-- ColdChain OS · 0018_retention_and_hardening
-- 1. Audit log never stores secret settings (and scrubs ones already logged).
-- 2. Readings retention: raw readings older than reading_retention_months are
--    rolled into hourly summaries, then removed. Runs daily via pg_cron.
-- 3. Housekeeping: old e-mail delivery rows are pruned after 90 days.
-- =============================================================================

create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_redact   constant text[] := array['key_hash', 'token_hash'];
  v_ignore   text[] := coalesce(tg_argv::text[], '{}'::text[]) || array['updated_at'];
  v_old      jsonb;
  v_new      jsonb;
  v_row      jsonb;
  v_changes  jsonb;
  v_company  uuid;
  v_resource text;
  v_action   text;
  v_claims   jsonb;
  v_headers  jsonb;
  v_ip       inet;
  v_metadata jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old) - v_redact;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new) - v_redact;
  end if;
  v_row := coalesce(v_new, v_old);

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k))
      into v_changes
    from jsonb_object_keys(v_new) as k
    where (v_old -> k) is distinct from (v_new -> k)
      and not (k = any (v_ignore));

    if v_changes is null then
      return null;  -- only ignored columns changed
    end if;
  end if;

  -- Secret settings (worker secret, API keys) are logged as changed, never
  -- with their value.
  if tg_table_name = 'app_settings'
     and (v_row ->> 'key') ~ '(secret|token|password|api_key)' then
    v_row := v_row || '{"value": "[redacted]"}'::jsonb;
    if v_changes ? 'value' then
      v_changes := jsonb_set(v_changes, '{value}', '{"from": "[redacted]", "to": "[redacted]"}'::jsonb);
    end if;
  end if;

  if tg_table_name = 'companies' then
    v_company := (v_row ->> 'id')::uuid;
  else
    v_company := (v_row ->> 'company_id')::uuid;
  end if;

  -- During a company deletion the children cascade away; log the company
  -- deletion once instead of every child row.
  if tg_op = 'DELETE' and v_company is not null
     and not exists (select 1 from public.companies c where c.id = v_company) then
    if tg_table_name <> 'companies' then
      return null;
    end if;
    v_company := null;
  end if;

  v_resource := coalesce(v_row ->> 'id', v_row ->> 'key', v_row ->> 'user_id');
  v_action := tg_table_name || '.' || case tg_op
    when 'INSERT' then 'created'
    when 'UPDATE' then 'updated'
    else 'deleted'
  end;

  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  begin
    v_ip := nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '')::inet;
  exception when others then
    v_ip := null;
  end;

  v_metadata := jsonb_strip_nulls(jsonb_build_object(
    'role', coalesce(v_claims ->> 'role', current_user),
    'changes', v_changes,
    'record', case when tg_op = 'UPDATE' then null else v_row - v_ignore end
  ));

  insert into public.audit_logs (
    company_id, actor_id, actor_email, action, resource_type, resource_id,
    metadata, ip, user_agent
  ) values (
    v_company,
    (select auth.uid()),
    v_claims ->> 'email',
    v_action,
    tg_table_name,
    v_resource,
    v_metadata,
    v_ip,
    left(v_headers ->> 'user-agent', 512)
  );

  return null;
end;
$$;

-- Scrub secret values that were logged before this migration.
alter table public.audit_logs disable trigger audit_logs_no_update_delete;
update public.audit_logs
set metadata = jsonb_set(metadata, '{record,value}', '"[redacted]"'::jsonb)
where resource_type = 'app_settings'
  and resource_id ~ '(secret|token|password|api_key)'
  and metadata ? 'record';
update public.audit_logs
set metadata = jsonb_set(metadata, '{changes,value}', '{"from": "[redacted]", "to": "[redacted]"}'::jsonb)
where resource_type = 'app_settings'
  and resource_id ~ '(secret|token|password|api_key)'
  and metadata -> 'changes' ? 'value';
alter table public.audit_logs enable trigger audit_logs_no_update_delete;

-- -----------------------------------------------------------------------------
-- Hourly summaries of readings past the retention window
-- -----------------------------------------------------------------------------
create table if not exists public.sensor_readings_hourly (
  sensor_id    uuid not null,
  company_id   uuid not null,
  warehouse_id uuid not null,
  zone_id      uuid references public.storage_zones (id) on delete set null,
  hour         timestamptz not null,
  readings     integer not null check (readings >= 0),
  temp_min     numeric(6, 2),
  temp_max     numeric(6, 2),
  temp_sum     numeric(16, 2) not null default 0,
  temp_n       integer not null default 0 check (temp_n >= 0),
  hum_min      numeric(6, 2),
  hum_max      numeric(6, 2),
  hum_sum      numeric(16, 2) not null default 0,
  hum_n        integer not null default 0 check (hum_n >= 0),
  primary key (sensor_id, hour),
  foreign key (sensor_id, warehouse_id, company_id)
    references public.sensors (id, warehouse_id, company_id) on delete cascade on update cascade
);
comment on table public.sensor_readings_hourly is
  'Hourly min/max/sum/count of readings older than the retention window. Average = sum / n.';

create index if not exists sensor_readings_hourly_company_idx on public.sensor_readings_hourly (company_id, hour desc);
create index if not exists sensor_readings_hourly_zone_idx on public.sensor_readings_hourly (zone_id, hour desc);
create index if not exists sensor_readings_hourly_warehouse_idx on public.sensor_readings_hourly (warehouse_id, sensor_id, company_id);

alter table public.sensor_readings_hourly enable row level security;
revoke all on public.sensor_readings_hourly from anon, authenticated;
grant select on public.sensor_readings_hourly to authenticated;
grant all on public.sensor_readings_hourly to service_role;

drop policy if exists sensor_readings_hourly_select on public.sensor_readings_hourly;
create policy sensor_readings_hourly_select on public.sensor_readings_hourly for select to authenticated
  using (
    company_id in (select private.member_company_ids())
    or (select private.is_platform_admin())
  );

-- Moves readings older than the retention window into the hourly table, in
-- batches. Returns the number of raw readings moved.
create or replace function private.roll_up_old_readings(p_batch integer default 20000, p_max_batches integer default 25)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_months integer;
  v_cutoff timestamptz;
  v_total  integer := 0;
  v_n      integer;
begin
  select (value #>> '{}')::integer into v_months
  from public.app_settings where key = 'reading_retention_months';
  -- Never shorter than 3 months, whatever the setting says.
  v_months := greatest(coalesce(v_months, 24), 3);
  v_cutoff := date_trunc('hour', now() - make_interval(months => v_months));

  for i in 1 .. greatest(p_max_batches, 1) loop
    with doomed as (
      select r.id
      from public.sensor_readings r
      where r.recorded_at < v_cutoff
      order by r.recorded_at
      limit greatest(p_batch, 1)
      for update skip locked
    ),
    moved as (
      delete from public.sensor_readings r
      using doomed d
      where r.id = d.id
      returning r.sensor_id, r.zone_id, r.recorded_at, r.temperature_c, r.humidity_pct, r.quality
    ),
    agg as (
      select
        m.sensor_id,
        s.company_id,
        s.warehouse_id,
        (array_agg(m.zone_id order by m.recorded_at desc))[1] as zone_id,
        date_trunc('hour', m.recorded_at) as hour,
        count(*) filter (where m.quality <> 'invalid') as readings,
        min(m.temperature_c) filter (where m.quality <> 'invalid') as temp_min,
        max(m.temperature_c) filter (where m.quality <> 'invalid') as temp_max,
        coalesce(sum(m.temperature_c) filter (where m.quality <> 'invalid'), 0) as temp_sum,
        count(m.temperature_c) filter (where m.quality <> 'invalid') as temp_n,
        min(m.humidity_pct) filter (where m.quality <> 'invalid') as hum_min,
        max(m.humidity_pct) filter (where m.quality <> 'invalid') as hum_max,
        coalesce(sum(m.humidity_pct) filter (where m.quality <> 'invalid'), 0) as hum_sum,
        count(m.humidity_pct) filter (where m.quality <> 'invalid') as hum_n
      from moved m
      join public.sensors s on s.id = m.sensor_id
      group by m.sensor_id, s.company_id, s.warehouse_id, date_trunc('hour', m.recorded_at)
    ),
    ins as (
      insert into public.sensor_readings_hourly as h (
        sensor_id, company_id, warehouse_id, zone_id, hour, readings,
        temp_min, temp_max, temp_sum, temp_n, hum_min, hum_max, hum_sum, hum_n
      )
      select sensor_id, company_id, warehouse_id, zone_id, hour, readings,
             temp_min, temp_max, temp_sum, temp_n, hum_min, hum_max, hum_sum, hum_n
      from agg
      on conflict (sensor_id, hour) do update set
        readings = h.readings + excluded.readings,
        temp_min = least(h.temp_min, excluded.temp_min),
        temp_max = greatest(h.temp_max, excluded.temp_max),
        temp_sum = h.temp_sum + excluded.temp_sum,
        temp_n   = h.temp_n + excluded.temp_n,
        hum_min  = least(h.hum_min, excluded.hum_min),
        hum_max  = greatest(h.hum_max, excluded.hum_max),
        hum_sum  = h.hum_sum + excluded.hum_sum,
        hum_n    = h.hum_n + excluded.hum_n
      returning 1
    )
    select count(*) into v_n from moved;

    v_total := v_total + v_n;
    exit when v_n < greatest(p_batch, 1);
  end loop;
  return v_total;
end;
$$;

revoke all on function private.roll_up_old_readings(integer, integer) from public;

-- Daily housekeeping: retention + pruning of old delivery rows.
create or replace function public.run_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rolled     integer;
  v_deliveries integer;
begin
  v_rolled := private.roll_up_old_readings();

  with gone as (
    delete from public.notification_deliveries
    where status <> 'pending' and created_at < now() - interval '90 days'
    returning 1
  )
  select count(*) into v_deliveries from gone;

  return jsonb_build_object('readings_rolled_up', v_rolled, 'deliveries_pruned', v_deliveries);
end;
$$;

revoke all on function public.run_housekeeping() from public, anon, authenticated;
grant execute on function public.run_housekeeping() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule(jobid) from cron.job where jobname = 'coldchain-housekeeping';
      perform cron.schedule('coldchain-housekeeping', '17 3 * * *', 'select public.run_housekeeping()');
    exception when others then
      raise notice 'Could not schedule housekeeping (%). Enable pg_cron and run this block again.', sqlerrm;
    end;
  end if;
end;
$$;
