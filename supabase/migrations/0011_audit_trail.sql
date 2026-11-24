-- =============================================================================
-- ColdChain OS · 0011_audit_trail
-- Row-level audit trigger: who changed what, from where. Secrets are never
-- copied into the log. Arguments to the trigger list columns to ignore
-- (telemetry that changes constantly and would flood the log).
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

-- Attach to every table whose changes matter for compliance.
create trigger companies_audit after insert or update or delete on public.companies
  for each row execute function private.audit_row();
create trigger company_members_audit after insert or update or delete on public.company_members
  for each row execute function private.audit_row();
create trigger company_invitations_audit after insert or update or delete on public.company_invitations
  for each row execute function private.audit_row();
create trigger platform_admins_audit after insert or update or delete on public.platform_admins
  for each row execute function private.audit_row();
create trigger warehouses_audit after insert or update or delete on public.warehouses
  for each row execute function private.audit_row();
create trigger warehouse_assignments_audit after insert or update or delete on public.warehouse_assignments
  for each row execute function private.audit_row();
create trigger storage_zones_audit after insert or update or delete on public.storage_zones
  for each row execute function private.audit_row();
create trigger equipment_audit after insert or update or delete on public.equipment
  for each row execute function private.audit_row();
create trigger sensors_audit after insert or update or delete on public.sensors
  for each row execute function private.audit_row(
    'last_seen_at', 'last_reading_at', 'battery_pct', 'signal_rssi', 'firmware_version'
  );
create trigger sensor_api_keys_audit after insert or update or delete on public.sensor_api_keys
  for each row execute function private.audit_row('last_used_at');
create trigger alerts_audit after insert or update or delete on public.alerts
  for each row execute function private.audit_row(
    'trigger_count', 'last_triggered_at', 'reading_id', 'observed_value'
  );
create trigger incidents_audit after insert or update or delete on public.incidents
  for each row execute function private.audit_row();
create trigger incident_attachments_audit after insert or update or delete on public.incident_attachments
  for each row execute function private.audit_row();
create trigger maintenance_schedules_audit after insert or update or delete on public.maintenance_schedules
  for each row execute function private.audit_row();
create trigger maintenance_tasks_audit after insert or update or delete on public.maintenance_tasks
  for each row execute function private.audit_row();
create trigger inspections_audit after insert or update or delete on public.inspections
  for each row execute function private.audit_row();
create trigger reports_audit after insert on public.reports
  for each row execute function private.audit_row();
create trigger subscription_plans_audit after insert or update or delete on public.subscription_plans
  for each row execute function private.audit_row();
create trigger customer_subscriptions_audit after insert or update or delete on public.customer_subscriptions
  for each row execute function private.audit_row();
create trigger payment_records_audit after insert or update or delete on public.payment_records
  for each row execute function private.audit_row();
create trigger refunds_audit after insert or update or delete on public.refunds
  for each row execute function private.audit_row();
create trigger invoices_audit after insert or update or delete on public.invoices
  for each row execute function private.audit_row();
create trigger app_settings_audit after insert or update or delete on public.app_settings
  for each row execute function private.audit_row();
