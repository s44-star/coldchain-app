-- =============================================================================
-- ColdChain OS · 0009_rls_policies
-- Row Level Security on every table, plus explicit table privileges.
-- Postgres RLS is the final wall between tenants; server-side role checks in
-- the app sit in front of it.
--
-- Role groups used below
--   members   any role in the company
--   ops       owner, admin, warehouse_manager, operator
--   admins    owner, admin
--   owner     owner
--   managed   warehouses the user may configure (private.managed_warehouse_ids)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Privileges. The anon role gets nothing except the public price list and the
-- invitation-preview RPC. TRUNCATE / REFERENCES / TRIGGER are never granted to
-- API roles (TRUNCATE would bypass RLS).
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
revoke truncate, references, trigger on all tables in schema public from authenticated, service_role;

revoke all on all sequences in schema public from anon, authenticated;
grant usage, select on all sequences in schema public to authenticated, service_role;

grant select on public.subscription_plans to anon;

-- Insert-only / system-written tables
revoke insert, update, delete on public.audit_logs from authenticated;
revoke update, delete on public.audit_logs from service_role;
revoke insert, update, delete on public.alert_events from authenticated;
revoke update, delete on public.alert_events from service_role;
revoke update, delete on public.incident_updates from authenticated;
revoke insert, update, delete on public.payment_webhook_events from authenticated;
revoke all on public.rate_limits from authenticated;

-- Future tables created by the migration role do not reach anon automatically.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere
-- -----------------------------------------------------------------------------
alter table public.profiles                enable row level security;
alter table public.companies               enable row level security;
alter table public.company_members         enable row level security;
alter table public.company_invitations     enable row level security;
alter table public.platform_admins         enable row level security;
alter table public.warehouses              enable row level security;
alter table public.warehouse_assignments   enable row level security;
alter table public.storage_zones           enable row level security;
alter table public.equipment               enable row level security;
alter table public.sensors                 enable row level security;
alter table public.sensor_api_keys         enable row level security;
alter table public.sensor_readings         enable row level security;
alter table public.alerts                  enable row level security;
alter table public.alert_events            enable row level security;
alter table public.incidents               enable row level security;
alter table public.incident_updates        enable row level security;
alter table public.incident_attachments    enable row level security;
alter table public.maintenance_schedules   enable row level security;
alter table public.maintenance_tasks       enable row level security;
alter table public.inspections             enable row level security;
alter table public.reports                 enable row level security;
alter table public.audit_logs              enable row level security;
alter table public.notifications           enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.subscription_plans      enable row level security;
alter table public.customer_subscriptions  enable row level security;
alter table public.payment_records         enable row level security;
alter table public.refunds                 enable row level security;
alter table public.invoices                enable row level security;
alter table public.payment_webhook_events  enable row level security;
alter table public.app_settings            enable row level security;
alter table public.rate_limits             enable row level security;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or id in (select private.colleague_ids())
    or (select private.is_platform_admin())
  );

create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- companies (created through public.create_company)
-- -----------------------------------------------------------------------------
create policy companies_select on public.companies for select to authenticated
  using (
    id in (select private.member_company_ids())
    or (select private.is_platform_admin())
  );

create policy companies_update on public.companies for update to authenticated
  using (
    id in (select private.member_company_ids(array['owner', 'admin']::public.member_role[]))
    or (select private.is_platform_admin())
  )
  with check (
    id in (select private.member_company_ids(array['owner', 'admin']::public.member_role[]))
    or (select private.is_platform_admin())
  );

create policy companies_delete on public.companies for delete to authenticated
  using (
    id in (select private.member_company_ids(array['owner']::public.member_role[]))
    or (select private.is_platform_admin())
  );

-- -----------------------------------------------------------------------------
-- company_members (rows are added by create_company / accept_invitation;
-- the owner row changes only through transfer_ownership)
-- -----------------------------------------------------------------------------
create policy company_members_select on public.company_members for select to authenticated
  using (
    company_id in (select private.member_company_ids())
    or (select private.is_platform_admin())
  );

create policy company_members_update on public.company_members for update to authenticated
  using (
    role <> 'owner'
    and company_id in (select private.member_company_ids(array['owner', 'admin']::public.member_role[]))
  )
  with check (
    role <> 'owner'
    and company_id in (select private.member_company_ids(array['owner', 'admin']::public.member_role[]))
  );

create policy company_members_delete on public.company_members for delete to authenticated
  using (
    role <> 'owner'
    and (
      company_id in (select private.member_company_ids(array['owner', 'admin']::public.member_role[]))
      or user_id = (select auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- company_invitations
-- -----------------------------------------------------------------------------
create policy company_invitations_select on public.company_invitations for select to authenticated
  using (
    company_id in (select private.member_company_ids(array['owner', 'admin']::public.member_role[]))
    or (select private.is_platform_admin())
  );

create policy company_invitations_insert on public.company_invitations for insert to authenticated
  with check (
    company_id in (select private.member_company_ids(array['owner', 'admin']::public.member_role[]))
    and accepted_at is null
    and accepted_by is null
    and revoked_at is null
    and expires_at <= now() + interval '30 days'
  );

create policy company_invitations_update on public.company_invitations for update to authenticated
  using (company_id in (select private.member_company_ids(array['owner', 'admin']::public.member_role[])))
  with check (company_id in (select private.member_company_ids(array['owner', 'admin']::public.member_role[])));

create policy company_invitations_delete on public.company_invitations for delete to authenticated
  using (company_id in (select private.member_company_ids(array['owner', 'admin']::public.member_role[])));

-- -----------------------------------------------------------------------------
-- platform_admins (managed with SQL only)
-- -----------------------------------------------------------------------------
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_admin()));

-- -----------------------------------------------------------------------------
-- warehouses
-- -----------------------------------------------------------------------------
create policy warehouses_select on public.warehouses for select to authenticated
  using (
    company_id in (select private.member_company_ids())
    or (select private.is_platform_admin())
  );

create policy warehouses_insert on public.warehouses for insert to authenticated
  with check (company_id in (select private.member_company_ids(array['owner', 'admin']::public.member_role[])));

create policy warehouses_update on public.warehouses for update to authenticated
  using (company_id in (select private.member_company_ids(array['owner', 'admin']::public.member_role[])))
  with check (company_id in (select private.member_company_ids(array['owner', 'admin']::public.member_role[])));

-- -----------------------------------------------------------------------------
-- warehouse_assignments
-- -----------------------------------------------------------------------------
create policy warehouse_assignments_select on public.warehouse_assignments for select to authenticated
  using (
    company_id in (select private.member_company_ids())
    or (select private.is_platform_admin())
  );

create policy warehouse_assignments_insert on public.warehouse_assignments for insert to authenticated
  with check (company_id in (select private.member_company_ids(array['owner', 'admin']::public.member_role[])));

create policy warehouse_assignments_delete on public.warehouse_assignments for delete to authenticated
  using (company_id in (select private.member_company_ids(array['owner', 'admin']::public.member_role[])));

-- -----------------------------------------------------------------------------
-- storage_zones / equipment / sensors — configured by managers of the warehouse
-- -----------------------------------------------------------------------------
create policy storage_zones_select on public.storage_zones for select to authenticated
  using (
    company_id in (select private.member_company_ids())
    or (select private.is_platform_admin())
  );

create policy storage_zones_insert on public.storage_zones for insert to authenticated
  with check (warehouse_id in (select private.managed_warehouse_ids()));

create policy storage_zones_update on public.storage_zones for update to authenticated
  using (warehouse_id in (select private.managed_warehouse_ids()))
  with check (warehouse_id in (select private.managed_warehouse_ids()));

create policy equipment_select on public.equipment for select to authenticated
  using (
    company_id in (select private.member_company_ids())
    or (select private.is_platform_admin())
  );

create policy equipment_insert on public.equipment for insert to authenticated
  with check (warehouse_id in (select private.managed_warehouse_ids()));

create policy equipment_update on public.equipment for update to authenticated
  using (warehouse_id in (select private.managed_warehouse_ids()))
  with check (warehouse_id in (select private.managed_warehouse_ids()));

create policy sensors_select on public.sensors for select to authenticated
  using (
    company_id in (select private.member_company_ids())
    or (select private.is_platform_admin())
  );

create policy sensors_insert on public.sensors for insert to authenticated
  with check (warehouse_id in (select private.managed_warehouse_ids()));

create policy sensors_update on public.sensors for update to authenticated
  using (warehouse_id in (select private.managed_warehouse_ids()))
  with check (warehouse_id in (select private.managed_warehouse_ids()));

-- -----------------------------------------------------------------------------
-- sensor_api_keys — visible and manageable by managers of the sensor's warehouse
-- -----------------------------------------------------------------------------
create policy sensor_api_keys_select on public.sensor_api_keys for select to authenticated
  using (
    sensor_id in (
      select s.id from public.sensors s
      where s.warehouse_id in (select private.managed_warehouse_ids())
    )
    or (select private.is_platform_admin())
  );

create policy sensor_api_keys_insert on public.sensor_api_keys for insert to authenticated
  with check (
    sensor_id in (
      select s.id from public.sensors s
      where s.warehouse_id in (select private.managed_warehouse_ids())
    )
    and revoked_at is null
    and last_used_at is null
  );

create policy sensor_api_keys_update on public.sensor_api_keys for update to authenticated
  using (
    sensor_id in (
      select s.id from public.sensors s
      where s.warehouse_id in (select private.managed_warehouse_ids())
    )
  )
  with check (
    sensor_id in (
      select s.id from public.sensors s
      where s.warehouse_id in (select private.managed_warehouse_ids())
    )
  );

-- -----------------------------------------------------------------------------
-- sensor_readings — devices write through the ingestion API (service role);
-- people may add manual readings only.
-- -----------------------------------------------------------------------------
create policy sensor_readings_select on public.sensor_readings for select to authenticated
  using (
    company_id in (select private.member_company_ids())
    or (select private.is_platform_admin())
  );

create policy sensor_readings_insert_manual on public.sensor_readings for insert to authenticated
  with check (
    company_id in (select private.member_company_ids(
      array['owner', 'admin', 'warehouse_manager', 'operator']::public.member_role[]
    ))
    and source = 'manual'
    and recorded_at <= now() + interval '5 minutes'
  );

-- -----------------------------------------------------------------------------
-- alerts / alert_events
-- -----------------------------------------------------------------------------
create policy alerts_select on public.alerts for select to authenticated
  using (
    company_id in (select private.member_company_ids())
    or (select private.is_platform_admin())
  );

create policy alerts_update on public.alerts for update to authenticated
  using (company_id in (select private.member_company_ids(
    array['owner', 'admin', 'warehouse_manager', 'operator']::public.member_role[]
  )))
  with check (company_id in (select private.member_company_ids(
    array['owner', 'admin', 'warehouse_manager', 'operator']::public.member_role[]
  )));

create policy alert_events_select on public.alert_events for select to authenticated
  using (
    company_id in (select private.member_company_ids())
    or (select private.is_platform_admin())
  );

-- -----------------------------------------------------------------------------
-- incidents / updates / attachments
-- -----------------------------------------------------------------------------
create policy incidents_select on public.incidents for select to authenticated
  using (
    company_id in (select private.member_company_ids())
    or (select private.is_platform_admin())
  );

create policy incidents_insert on public.incidents for insert to authenticated
  with check (
    company_id in (select private.member_company_ids(
      array['owner', 'admin', 'warehouse_manager', 'operator']::public.member_role[]
    ))
    and status = 'open'
  );

create policy incidents_update on public.incidents for update to authenticated
  using (company_id in (select private.member_company_ids(
    array['owner', 'admin', 'warehouse_manager', 'operator']::public.member_role[]
  )))
  with check (company_id in (select private.member_company_ids(
    array['owner', 'admin', 'warehouse_manager', 'operator']::public.member_role[]
  )));

create policy incident_updates_select on public.incident_updates for select to authenticated
  using (
    company_id in (select private.member_company_ids())
    or (select private.is_platform_admin())
  );

-- Comments only; status entries are written by the incidents trigger.
create policy incident_updates_insert on public.incident_updates for insert to authenticated
  with check (
    company_id in (select private.member_company_ids(
      array['owner', 'admin', 'warehouse_manager', 'operator']::public.member_role[]
    ))
    and body is not null
    and from_status is null
    and to_status is null
  );

create policy incident_attachments_select on public.incident_attachments for select to authenticated
  using (
    company_id in (select private.member_company_ids())
    or (select private.is_platform_admin())
  );

create policy incident_attachments_insert on public.incident_attachments for insert to authenticated
  with check (company_id in (select private.member_company_ids(
    array['owner', 'admin', 'warehouse_manager', 'operator']::public.member_role[]
  )));

create policy incident_attachments_delete on public.incident_attachments for delete to authenticated
  using (
    company_id in (select private.member_company_ids(array['owner', 'admin']::public.member_role[]))
    or (
      uploaded_by = (select auth.uid())
      and company_id in (select private.member_company_ids(
        array['owner', 'admin', 'warehouse_manager', 'operator']::public.member_role[]
      ))
    )
  );

-- -----------------------------------------------------------------------------
-- maintenance & inspections
-- -----------------------------------------------------------------------------
create policy maintenance_schedules_select on public.maintenance_schedules for select to authenticated
  using (
    company_id in (select private.member_company_ids())
    or (select private.is_platform_admin())
  );

create policy maintenance_schedules_insert on public.maintenance_schedules for insert to authenticated
  with check (warehouse_id in (select private.managed_warehouse_ids()));

create policy maintenance_schedules_update on public.maintenance_schedules for update to authenticated
  using (warehouse_id in (select private.managed_warehouse_ids()))
  with check (warehouse_id in (select private.managed_warehouse_ids()));

create policy maintenance_schedules_delete on public.maintenance_schedules for delete to authenticated
  using (warehouse_id in (select private.managed_warehouse_ids()));

create policy maintenance_tasks_select on public.maintenance_tasks for select to authenticated
  using (
    company_id in (select private.member_company_ids())
    or (select private.is_platform_admin())
  );

create policy maintenance_tasks_insert on public.maintenance_tasks for insert to authenticated
  with check (warehouse_id in (select private.managed_warehouse_ids()));

-- Operators may update (complete) tasks; which columns they may touch is
-- enforced by the maintenance_tasks_b_rules trigger.
create policy maintenance_tasks_update on public.maintenance_tasks for update to authenticated
  using (company_id in (select private.member_company_ids(
    array['owner', 'admin', 'warehouse_manager', 'operator']::public.member_role[]
  )))
  with check (company_id in (select private.member_company_ids(
    array['owner', 'admin', 'warehouse_manager', 'operator']::public.member_role[]
  )));

create policy maintenance_tasks_delete on public.maintenance_tasks for delete to authenticated
  using (warehouse_id in (select private.managed_warehouse_ids()));

create policy inspections_select on public.inspections for select to authenticated
  using (
    company_id in (select private.member_company_ids())
    or (select private.is_platform_admin())
  );

create policy inspections_insert on public.inspections for insert to authenticated
  with check (company_id in (select private.member_company_ids(
    array['owner', 'admin', 'warehouse_manager', 'operator']::public.member_role[]
  )));

create policy inspections_update on public.inspections for update to authenticated
  using (
    (
      inspector_id = (select auth.uid())
      and company_id in (select private.member_company_ids(
        array['owner', 'admin', 'warehouse_manager', 'operator']::public.member_role[]
      ))
    )
    or warehouse_id in (select private.managed_warehouse_ids())
  )
  with check (
    company_id in (select private.member_company_ids(
      array['owner', 'admin', 'warehouse_manager', 'operator']::public.member_role[]
    ))
  );

create policy inspections_delete on public.inspections for delete to authenticated
  using (warehouse_id in (select private.managed_warehouse_ids()));

-- -----------------------------------------------------------------------------
-- reports — every member may export; each export is recorded
-- -----------------------------------------------------------------------------
create policy reports_select on public.reports for select to authenticated
  using (
    company_id in (select private.member_company_ids())
    or (select private.is_platform_admin())
  );

create policy reports_insert on public.reports for insert to authenticated
  with check (company_id in (select private.member_company_ids()));

-- -----------------------------------------------------------------------------
-- audit_logs — read by company Owner/Admin and platform admins; never written
-- by API users (triggers and the server write it)
-- -----------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    company_id in (select private.member_company_ids(array['owner', 'admin']::public.member_role[]))
    or (select private.is_platform_admin())
  );

-- -----------------------------------------------------------------------------
-- notifications — each user sees and marks only their own
-- -----------------------------------------------------------------------------
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

create policy notification_deliveries_select on public.notification_deliveries for select to authenticated
  using (
    company_id in (select private.member_company_ids(array['owner', 'admin']::public.member_role[]))
    or (select private.is_platform_admin())
  );

-- -----------------------------------------------------------------------------
-- billing — Owner reads; the server (service role) writes
-- -----------------------------------------------------------------------------
create policy subscription_plans_public_select on public.subscription_plans for select to anon, authenticated
  using (is_active and is_public);

create policy subscription_plans_admin_select on public.subscription_plans for select to authenticated
  using ((select private.is_platform_admin()));

create policy subscription_plans_admin_insert on public.subscription_plans for insert to authenticated
  with check ((select private.is_platform_admin()));

create policy subscription_plans_admin_update on public.subscription_plans for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

create policy customer_subscriptions_select on public.customer_subscriptions for select to authenticated
  using (
    company_id in (select private.member_company_ids(array['owner']::public.member_role[]))
    or (select private.is_platform_admin())
  );

create policy payment_records_select on public.payment_records for select to authenticated
  using (
    company_id in (select private.member_company_ids(array['owner']::public.member_role[]))
    or (select private.is_platform_admin())
  );

create policy refunds_select on public.refunds for select to authenticated
  using (
    company_id in (select private.member_company_ids(array['owner']::public.member_role[]))
    or (select private.is_platform_admin())
  );

create policy invoices_select on public.invoices for select to authenticated
  using (
    company_id in (select private.member_company_ids(array['owner']::public.member_role[]))
    or (select private.is_platform_admin())
  );

create policy payment_webhook_events_select on public.payment_webhook_events for select to authenticated
  using ((select private.is_platform_admin()));

-- -----------------------------------------------------------------------------
-- app_settings
-- -----------------------------------------------------------------------------
create policy app_settings_select on public.app_settings for select to authenticated
  using (is_public or (select private.is_platform_admin()));

create policy app_settings_admin_insert on public.app_settings for insert to authenticated
  with check ((select private.is_platform_admin()));

create policy app_settings_admin_update on public.app_settings for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

-- rate_limits: RLS enabled with no policies — reachable only through
-- public.check_rate_limit (service role).
