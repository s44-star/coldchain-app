-- =============================================================================
-- ColdChain OS · 0001_foundation
-- Private schema, enum types and shared trigger functions.
-- Run migrations in numeric order in the Supabase SQL Editor.
-- =============================================================================

-- Internal helpers live in `private`, which the Data API does not expose, so
-- nothing here can be called as an RPC from the browser.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Enum types
-- -----------------------------------------------------------------------------
create type public.company_status as enum ('trial', 'active', 'past_due', 'suspended', 'cancelled');
create type public.member_role as enum ('owner', 'admin', 'warehouse_manager', 'operator', 'viewer');

create type public.warehouse_type as enum (
  'cold_storage', 'distribution_center', 'pharmaceutical', 'food_processing', 'port_terminal', 'other'
);
create type public.warehouse_status as enum ('operational', 'limited', 'offline');
create type public.zone_type as enum ('room', 'refrigerated', 'freezer', 'zone');
create type public.equipment_status as enum ('operational', 'maintenance', 'faulty', 'decommissioned');

create type public.sensor_type as enum ('temperature', 'humidity', 'temperature_humidity');
create type public.sensor_status as enum ('registered', 'active', 'offline', 'retired');
create type public.reading_source as enum ('device', 'manual', 'simulated');
create type public.reading_quality as enum ('ok', 'suspect', 'invalid');

create type public.alert_type as enum (
  'temperature_high', 'temperature_low', 'humidity_high', 'humidity_low',
  'missing_readings', 'sensor_offline', 'maintenance_due', 'maintenance_overdue'
);
create type public.alert_severity as enum ('info', 'warning', 'critical');
create type public.alert_status as enum ('open', 'acknowledged', 'resolved');
create type public.alert_event_type as enum ('created', 'acknowledged', 'assigned', 'resolved', 'reopened', 'retriggered');

create type public.incident_status as enum ('open', 'under_investigation', 'action_required', 'resolved', 'closed');
create type public.maintenance_status as enum ('pending', 'in_progress', 'completed', 'cancelled');
create type public.inspection_result as enum ('pass', 'fail', 'needs_attention');

create type public.report_type as enum (
  'temperature_log', 'alert_history', 'incident_report', 'maintenance_log', 'audit_trail', 'compliance_summary'
);
create type public.report_format as enum ('csv', 'pdf');

create type public.notification_channel as enum ('email', 'sms');
create type public.delivery_status as enum ('pending', 'sent', 'failed', 'provider_not_configured');

create type public.billing_interval as enum ('monthly', 'annual');
create type public.subscription_status as enum ('incomplete', 'trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired');
create type public.payment_purpose as enum ('setup_fee', 'subscription');
create type public.payment_status as enum ('created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded');
create type public.refund_status as enum ('pending', 'processed', 'failed');
create type public.invoice_status as enum ('draft', 'issued', 'paid', 'void');

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Shared trigger: block changes to listed columns for API users.
-- Usage: execute function private.guard_immutable_columns('company_id', 'created_at')
-- Server code (service role) and SECURITY DEFINER functions are not affected,
-- because they do not run as the `authenticated` / `anon` roles.
-- -----------------------------------------------------------------------------
create or replace function private.guard_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text;
  old_row jsonb := to_jsonb(old);
  new_row jsonb := to_jsonb(new);
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  foreach col in array tg_argv loop
    if (old_row -> col) is distinct from (new_row -> col) then
      raise exception 'Column "%" of "%" cannot be changed', col, tg_table_name
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- IANA time-zone validation used by CHECK constraints.
-- Declared IMMUTABLE because the zone list only changes with server upgrades.
-- -----------------------------------------------------------------------------
create or replace function private.is_valid_timezone(tz text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if tz is null or length(tz) > 64 then
    return false;
  end if;
  perform now() at time zone tz;
  return true;
exception when others then
  return false;
end;
$$;

grant execute on function private.is_valid_timezone(text) to authenticated, service_role;
