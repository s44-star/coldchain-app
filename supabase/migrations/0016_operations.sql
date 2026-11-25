-- =============================================================================
-- ColdChain OS · 0016_operations
-- Maintenance automation, the overdue-maintenance sweep, and plan limits.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Maintenance: a schedule creates its first task; completing a scheduled task
-- moves the schedule forward and creates the next one.
-- -----------------------------------------------------------------------------
create or replace function private.maintenance_schedule_first_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active then
    insert into public.maintenance_tasks (company_id, warehouse_id, equipment_id, schedule_id, title, description, assigned_to, due_at, created_by)
    values (new.company_id, new.warehouse_id, new.equipment_id, new.id, new.title, new.description, new.assigned_to, new.next_due_at, new.created_by);
  end if;
  return null;
end;
$$;

create trigger maintenance_schedules_first_task
  after insert on public.maintenance_schedules
  for each row execute function private.maintenance_schedule_first_task();

create or replace function private.maintenance_task_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sch public.maintenance_schedules%rowtype;
  v_next timestamptz;
begin
  if new.status <> 'completed' or old.status = 'completed' or new.schedule_id is null then
    return null;
  end if;

  select * into sch from public.maintenance_schedules where id = new.schedule_id for update;
  if not found or not sch.is_active then
    return null;
  end if;

  v_next := coalesce(new.completed_at, now()) + make_interval(days => sch.interval_days);
  update public.maintenance_schedules set next_due_at = v_next where id = sch.id;

  -- Only one open task per schedule.
  if not exists (
    select 1 from public.maintenance_tasks
    where schedule_id = sch.id and status in ('pending', 'in_progress') and id <> new.id
  ) then
    insert into public.maintenance_tasks (company_id, warehouse_id, equipment_id, schedule_id, title, description, assigned_to, due_at, created_by)
    values (sch.company_id, sch.warehouse_id, sch.equipment_id, sch.id, sch.title, sch.description, sch.assigned_to, v_next, sch.created_by);
  end if;

  -- The overdue alert for this task, if any, is now settled.
  update public.alerts
  set status = 'resolved', resolution_notes = 'Maintenance task completed'
  where company_id = new.company_id and dedupe_key = 'task:' || new.id || ':overdue' and status <> 'resolved';

  return null;
end;
$$;

create trigger maintenance_tasks_completed
  after update of status on public.maintenance_tasks
  for each row execute function private.maintenance_task_completed();

-- -----------------------------------------------------------------------------
-- sweep_maintenance — raise one alert per overdue task.
-- -----------------------------------------------------------------------------
create or replace function public.sweep_maintenance()
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
    select t.*, e.name as equipment_name
    from public.maintenance_tasks t
    join public.equipment e on e.id = t.equipment_id
    join public.companies c on c.id = t.company_id
    where t.status in ('pending', 'in_progress')
      and t.due_at < now()
      and c.status not in ('suspended', 'cancelled')
      and not exists (
        select 1 from public.alerts a
        where a.company_id = t.company_id and a.dedupe_key = 'task:' || t.id || ':overdue'
      )
  loop
    perform private.raise_alert(
      rec.company_id, rec.warehouse_id, null, null, 'maintenance_overdue', 'warning',
      'task:' || rec.id || ':overdue',
      format('Maintenance overdue: %s', rec.title),
      format('%s was due on %s UTC.', rec.equipment_name, to_char(rec.due_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI')),
      null, null, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.run_sweeps()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object('sensors', public.sweep_sensors(), 'maintenance', public.sweep_maintenance());
$$;

revoke all on function public.sweep_maintenance() from public, anon, authenticated;
revoke all on function public.run_sweeps() from public, anon, authenticated;
grant execute on function public.sweep_maintenance() to service_role;
grant execute on function public.run_sweeps() to service_role;

-- -----------------------------------------------------------------------------
-- Plan limits. Paid companies get their plan's limits; trials get the
-- Professional limits so they can evaluate properly; demo companies and
-- plans with null limits are unlimited.
-- -----------------------------------------------------------------------------
create or replace function private.plan_limits(p_company_id uuid)
returns table (plan_name text, max_warehouses integer, max_zones integer, max_sensors integer, max_users integer)
language sql
stable
security definer
set search_path = ''
as $$
  with company as (
    select * from public.companies where id = p_company_id
  ),
  paid as (
    select p.*
    from public.customer_subscriptions s
    join public.subscription_plans p on p.id = s.plan_id
    where s.company_id = p_company_id and s.current_period_end > now() - interval '3 days'
    order by s.current_period_end desc
    limit 1
  ),
  trial as (
    select * from public.subscription_plans where code = 'professional'
  )
  select
    coalesce((select name from paid), (select name from trial), 'Trial'),
    case when (select is_demo from company) then null else coalesce((select max_warehouses from paid), (select max_warehouses from trial)) end,
    case when (select is_demo from company) then null else coalesce((select max_zones from paid), (select max_zones from trial)) end,
    case when (select is_demo from company) then null else coalesce((select max_sensors from paid), (select max_sensors from trial)) end,
    case when (select is_demo from company) then null else coalesce((select max_users from paid), (select max_users from trial)) end;
$$;

-- Runs with the caller's rights (not SECURITY DEFINER) so current_user tells
-- API users apart from server jobs; the counted rows are visible to the
-- members who can insert them.
create or replace function private.enforce_plan_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  lim    record;
  v_used integer;
  v_max  integer;
  v_what text;
begin
  -- Platform staff and server jobs are not limited.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  select * into lim from private.plan_limits(new.company_id);

  if tg_table_name = 'warehouses' then
    v_max := lim.max_warehouses; v_what := 'warehouses';
    select count(*) into v_used from public.warehouses where company_id = new.company_id and archived_at is null;
  elsif tg_table_name = 'storage_zones' then
    v_max := lim.max_zones; v_what := 'zones';
    select count(*) into v_used from public.storage_zones where company_id = new.company_id and archived_at is null;
  elsif tg_table_name = 'sensors' then
    v_max := lim.max_sensors; v_what := 'sensors';
    select count(*) into v_used from public.sensors where company_id = new.company_id and archived_at is null;
  elsif tg_table_name = 'company_invitations' then
    v_max := lim.max_users; v_what := 'users';
    select (select count(*) from public.company_members where company_id = new.company_id)
         + (select count(*) from public.company_invitations
            where company_id = new.company_id and accepted_at is null and revoked_at is null and expires_at > now())
      into v_used;
  end if;

  if v_max is not null and v_used >= v_max then
    raise exception 'Plan limit reached: the % plan includes % %. Upgrade on the Billing page to add more.', lim.plan_name, v_max, v_what
      using errcode = '53400';
  end if;
  return new;
end;
$$;

revoke all on function private.plan_limits(uuid) from public;
grant execute on function private.plan_limits(uuid) to authenticated, service_role;

create trigger warehouses_plan_limit before insert on public.warehouses
  for each row execute function private.enforce_plan_limit();
create trigger storage_zones_plan_limit before insert on public.storage_zones
  for each row execute function private.enforce_plan_limit();
create trigger sensors_plan_limit before insert on public.sensors
  for each row execute function private.enforce_plan_limit();
create trigger company_invitations_plan_limit before insert on public.company_invitations
  for each row execute function private.enforce_plan_limit();

-- Usage for the billing page: what the company uses against its limits.
create or replace function public.company_usage(p_company_id uuid)
returns table (plan_name text, warehouses integer, max_warehouses integer, zones integer, max_zones integer,
               sensors integer, max_sensors integer, users integer, max_users integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lim record;
begin
  if not (private.is_company_member(p_company_id) or private.is_platform_admin()) then
    raise exception 'Not a member of this company' using errcode = '42501';
  end if;
  select * into lim from private.plan_limits(p_company_id);
  return query select
    lim.plan_name,
    (select count(*)::integer from public.warehouses where company_id = p_company_id and archived_at is null), lim.max_warehouses,
    (select count(*)::integer from public.storage_zones where company_id = p_company_id and archived_at is null), lim.max_zones,
    (select count(*)::integer from public.sensors where company_id = p_company_id and archived_at is null), lim.max_sensors,
    (select count(*)::integer from public.company_members where company_id = p_company_id), lim.max_users;
end;
$$;

revoke all on function public.company_usage(uuid) from public, anon;
grant execute on function public.company_usage(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Run both sweeps every 5 minutes (replaces the Stage 3 schedule).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    return;
  end if;
  begin
    perform cron.unschedule(jobid) from cron.job where jobname in ('coldchain-sweep-sensors', 'coldchain-sweeps');
    perform cron.schedule('coldchain-sweeps', '*/5 * * * *', 'select public.run_sweeps()');
  exception when others then
    raise notice 'Could not schedule with pg_cron (%). Enable pg_cron and run this block again.', sqlerrm;
  end;
end;
$$;
