-- =============================================================================
-- ColdChain OS · 0010_business_rules
-- Triggers that stamp the acting user, enforce state transitions and keep
-- history tables complete. They run for every write path (app, SQL, service).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Stamp the acting user into the listed columns on INSERT by API users.
-- Clients cannot forge "created_by" / "reported_by" / "uploaded_by".
-- -----------------------------------------------------------------------------
create or replace function private.stamp_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text;
begin
  if current_user = 'authenticated' then
    foreach col in array tg_argv loop
      new := jsonb_populate_record(new, jsonb_build_object(col, (select auth.uid())));
    end loop;
  end if;
  return new;
end;
$$;

create trigger warehouses_stamp_actor before insert on public.warehouses
  for each row execute function private.stamp_actor('created_by');
create trigger warehouse_assignments_stamp_actor before insert on public.warehouse_assignments
  for each row execute function private.stamp_actor('created_by');
create trigger storage_zones_stamp_actor before insert on public.storage_zones
  for each row execute function private.stamp_actor('created_by');
create trigger equipment_stamp_actor before insert on public.equipment
  for each row execute function private.stamp_actor('created_by');
create trigger sensors_stamp_actor before insert on public.sensors
  for each row execute function private.stamp_actor('created_by');
create trigger sensor_api_keys_stamp_actor before insert on public.sensor_api_keys
  for each row execute function private.stamp_actor('created_by');
create trigger sensor_readings_stamp_actor before insert on public.sensor_readings
  for each row execute function private.stamp_actor('recorded_by');
create trigger company_invitations_stamp_actor before insert on public.company_invitations
  for each row execute function private.stamp_actor('invited_by');
create trigger incidents_stamp_actor before insert on public.incidents
  for each row execute function private.stamp_actor('reported_by');
create trigger incident_updates_stamp_actor before insert on public.incident_updates
  for each row execute function private.stamp_actor('author_id');
create trigger incident_attachments_stamp_actor before insert on public.incident_attachments
  for each row execute function private.stamp_actor('uploaded_by');
create trigger maintenance_schedules_stamp_actor before insert on public.maintenance_schedules
  for each row execute function private.stamp_actor('created_by');
create trigger maintenance_tasks_stamp_actor before insert on public.maintenance_tasks
  for each row execute function private.stamp_actor('created_by');
create trigger inspections_stamp_actor before insert on public.inspections
  for each row execute function private.stamp_actor('inspector_id');
create trigger reports_stamp_actor before insert on public.reports
  for each row execute function private.stamp_actor('generated_by');

-- -----------------------------------------------------------------------------
-- companies — subscription state is controlled by billing / platform admins
-- -----------------------------------------------------------------------------
create or replace function private.companies_protect_billing_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not (select private.is_platform_admin()) then
    if new.status is distinct from old.status
       or new.trial_ends_at is distinct from old.trial_ends_at
       or new.is_demo is distinct from old.is_demo then
      raise exception 'Subscription status can only be changed by billing'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger companies_b_protect_billing_state
  before update on public.companies
  for each row execute function private.companies_protect_billing_state();

-- -----------------------------------------------------------------------------
-- alerts — status transitions stamp who did what, and every change is
-- written to alert_events.
-- -----------------------------------------------------------------------------
create or replace function private.alerts_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if new.status is distinct from old.status then
    if new.status = 'acknowledged' then
      if old.status <> 'open' then
        raise exception 'Only open alerts can be acknowledged' using errcode = '22023';
      end if;
      new.acknowledged_by := v_uid;
      new.acknowledged_at := now();
    elsif new.status = 'resolved' then
      new.resolved_by := v_uid;
      new.resolved_at := now();
      if new.acknowledged_at is null then
        new.acknowledged_by := v_uid;
        new.acknowledged_at := new.resolved_at;
      end if;
    elsif new.status = 'open' then
      new.acknowledged_by := null;
      new.acknowledged_at := null;
      new.resolved_by := null;
      new.resolved_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger alerts_b_status_transition
  before update on public.alerts
  for each row execute function private.alerts_status_transition();

create or replace function private.alerts_write_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.alert_events (company_id, alert_id, event_type, actor_id, to_status, note)
    values (new.company_id, new.id, 'created', v_uid, new.status, new.title);
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.alert_events (company_id, alert_id, event_type, actor_id, from_status, to_status, note)
    values (
      new.company_id, new.id,
      case new.status
        when 'acknowledged' then 'acknowledged'::public.alert_event_type
        when 'resolved' then 'resolved'::public.alert_event_type
        else 'reopened'::public.alert_event_type
      end,
      v_uid, old.status, new.status,
      case when new.status = 'resolved' then new.resolution_notes end
    );
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into public.alert_events (company_id, alert_id, event_type, actor_id, assigned_to)
    values (new.company_id, new.id, 'assigned', v_uid, new.assigned_to);
  end if;

  if new.trigger_count > old.trigger_count then
    insert into public.alert_events (company_id, alert_id, event_type, actor_id, note)
    values (new.company_id, new.id, 'retriggered', v_uid, 'Condition detected again');
  end if;

  return null;
end;
$$;

create trigger alerts_write_history
  after insert or update on public.alerts
  for each row execute function private.alerts_write_history();

-- -----------------------------------------------------------------------------
-- incidents — resolution is required before resolving/closing; timestamps
-- are stamped; status changes appear on the timeline automatically.
-- -----------------------------------------------------------------------------
create or replace function private.incidents_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('resolved', 'closed') and coalesce(trim(new.resolution), '') = '' then
      raise exception 'A resolution is required before an incident is resolved or closed'
        using errcode = '23514';
    end if;

    if new.status = 'resolved' then
      new.resolved_at := now();
      new.closed_at := null;
    elsif new.status = 'closed' then
      new.resolved_at := coalesce(old.resolved_at, now());
      new.closed_at := now();
    else
      new.resolved_at := null;
      new.closed_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger incidents_b_status_transition
  before update on public.incidents
  for each row execute function private.incidents_status_transition();

create or replace function private.incidents_write_timeline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.incident_updates (company_id, incident_id, author_id, body, to_status)
    values (new.company_id, new.id, (select auth.uid()), 'Incident reported', new.status);
  elsif new.status is distinct from old.status then
    insert into public.incident_updates (company_id, incident_id, author_id, from_status, to_status, body)
    values (
      new.company_id, new.id, (select auth.uid()), old.status, new.status,
      case when new.status in ('resolved', 'closed') then new.resolution end
    );
  end if;
  return null;
end;
$$;

create trigger incidents_write_timeline
  after insert or update on public.incidents
  for each row execute function private.incidents_write_timeline();

-- -----------------------------------------------------------------------------
-- maintenance_tasks — completion stamps; operators may only change status
-- and notes (managers of the warehouse may change everything else).
-- -----------------------------------------------------------------------------
create or replace function private.maintenance_tasks_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not private.can_manage_warehouse(old.warehouse_id) then
    if new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.assigned_to is distinct from old.assigned_to
       or new.due_at is distinct from old.due_at then
      raise exception 'Only status and notes can be updated on this task' using errcode = '42501';
    end if;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'completed' then
      new.completed_by := (select auth.uid());
      new.completed_at := now();
    else
      new.completed_by := null;
      new.completed_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger maintenance_tasks_b_rules
  before update on public.maintenance_tasks
  for each row execute function private.maintenance_tasks_rules();

-- Tasks created already completed (back-filled records) get stamped too.
create or replace function private.maintenance_tasks_on_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' then
    new.completed_by := coalesce(new.completed_by, (select auth.uid()));
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_by := null;
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger maintenance_tasks_on_insert
  before insert on public.maintenance_tasks
  for each row execute function private.maintenance_tasks_on_insert();

-- -----------------------------------------------------------------------------
-- warehouse_assignments — only Warehouse Managers are scoped to warehouses
-- -----------------------------------------------------------------------------
create or replace function private.warehouse_assignments_check_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.company_members m
    where m.company_id = new.company_id
      and m.user_id = new.user_id
      and m.role = 'warehouse_manager'
  ) then
    raise exception 'Only Warehouse Managers can be assigned to warehouses' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger warehouse_assignments_check_role
  before insert on public.warehouse_assignments
  for each row execute function private.warehouse_assignments_check_role();

-- When a manager changes role, their warehouse scoping no longer applies.
create or replace function private.company_members_role_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'warehouse_manager' and new.role <> 'warehouse_manager' then
    delete from public.warehouse_assignments
    where company_id = new.company_id and user_id = new.user_id;
  end if;
  return null;
end;
$$;

create trigger company_members_role_changed
  after update of role on public.company_members
  for each row execute function private.company_members_role_changed();
