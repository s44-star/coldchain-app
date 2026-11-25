-- =============================================================================
-- ColdChain OS · Stage 1 database setup (generated — do not edit)
-- Source: supabase/migrations/0001…0013 + supabase/seed/plans.sql
-- Paste into Supabase → SQL Editor → Run, once, on a fresh project.
-- =============================================================================

-- >>> 0001_foundation.sql
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

-- >>> 0002_identity_tenancy.sql
-- =============================================================================
-- ColdChain OS · 0002_identity_tenancy
-- Profiles, companies (tenants), memberships, invitations, platform admins.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles — 1:1 with auth.users, created automatically on signup
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null check (email = lower(email) and char_length(email) <= 254),
  full_name   text check (char_length(full_name) <= 120),
  phone       text check (char_length(phone) <= 32),
  locale      text not null default 'en' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  timezone    text not null default 'UTC' check (private.is_valid_timezone(timezone)),
  avatar_path text check (char_length(avatar_path) <= 512),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_email_idx on public.profiles (email);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger profiles_guard_columns
  before update on public.profiles
  for each row execute function private.guard_immutable_columns('id', 'email', 'created_at');

-- Create / sync a profile whenever an auth user is created or changes e-mail.
create or replace function private.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id, email, full_name)
    values (
      new.id,
      lower(coalesce(new.email, new.id::text || '@users.invalid')),
      nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120), '')
    )
    on conflict (id) do nothing;
  elsif tg_op = 'UPDATE' and new.email is distinct from old.email and new.email is not null then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_auth_user_change();

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.handle_auth_user_change();

-- -----------------------------------------------------------------------------
-- companies — the tenant
-- -----------------------------------------------------------------------------
create table public.companies (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null check (char_length(trim(name)) between 2 and 160),
  country_code                char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  vat_number                  text check (char_length(vat_number) <= 32),
  registration_number         text check (char_length(registration_number) <= 64),
  billing_email               text check (billing_email = lower(billing_email) and char_length(billing_email) <= 254),
  address_line1               text check (char_length(address_line1) <= 200),
  address_line2               text check (char_length(address_line2) <= 200),
  city                        text check (char_length(city) <= 120),
  postal_code                 text check (char_length(postal_code) <= 20),
  status                      public.company_status not null default 'trial',
  trial_ends_at               timestamptz,
  is_demo                     boolean not null default false,
  -- Alert severity defaults (configurable per company)
  critical_temp_excursion_c   numeric(4, 1) not null default 2.0
                              check (critical_temp_excursion_c between 0 and 50),
  critical_humidity_excursion numeric(4, 1) not null default 10.0
                              check (critical_humidity_excursion between 0 and 100),
  missing_reading_factor      numeric(3, 1) not null default 2.0
                              check (missing_reading_factor between 1 and 10),
  created_by                  uuid references public.profiles (id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index companies_status_idx on public.companies (status);
create index companies_created_by_idx on public.companies (created_by);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function private.set_updated_at();

create trigger companies_guard_columns
  before update on public.companies
  for each row execute function private.guard_immutable_columns('id', 'created_by', 'created_at');

-- -----------------------------------------------------------------------------
-- company_members — user ↔ company with a role
-- -----------------------------------------------------------------------------
create table public.company_members (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.member_role not null,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

-- Exactly one owner per company.
create unique index company_members_one_owner_idx
  on public.company_members (company_id) where role = 'owner';
create index company_members_user_idx on public.company_members (user_id);
create index company_members_invited_by_idx on public.company_members (invited_by);

create trigger company_members_set_updated_at
  before update on public.company_members
  for each row execute function private.set_updated_at();

create trigger company_members_guard_columns
  before update on public.company_members
  for each row execute function private.guard_immutable_columns('id', 'company_id', 'user_id', 'invited_by', 'created_at');

-- -----------------------------------------------------------------------------
-- company_invitations — the raw token is e-mailed; only its SHA-256 is stored
-- -----------------------------------------------------------------------------
create table public.company_invitations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  email       text not null check (
                email = lower(email)
                and char_length(email) <= 254
                and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
              ),
  role        public.member_role not null check (role <> 'owner'),
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by  uuid references public.profiles (id) on delete set null,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (expires_at > created_at)
);

-- One pending invitation per e-mail per company.
create unique index company_invitations_pending_idx
  on public.company_invitations (company_id, email)
  where accepted_at is null and revoked_at is null;
create index company_invitations_invited_by_idx on public.company_invitations (invited_by);
create index company_invitations_accepted_by_idx on public.company_invitations (accepted_by);

create trigger company_invitations_set_updated_at
  before update on public.company_invitations
  for each row execute function private.set_updated_at();

create trigger company_invitations_guard_columns
  before update on public.company_invitations
  for each row execute function private.guard_immutable_columns(
    'id', 'company_id', 'email', 'role', 'token_hash', 'invited_by', 'expires_at',
    'accepted_at', 'accepted_by', 'created_at'
  );

-- -----------------------------------------------------------------------------
-- platform_admins — super admins; granted only by SQL, never from the app
-- -----------------------------------------------------------------------------
create table public.platform_admins (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  note       text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);

-- >>> 0003_operations.sql
-- =============================================================================
-- ColdChain OS · 0003_operations
-- Warehouses, zones, equipment, sensors, device keys, readings.
-- Child tables carry company_id and use composite foreign keys, so a row can
-- never point at another company's parent row, even through an app bug.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- warehouses
-- -----------------------------------------------------------------------------
create table public.warehouses (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies (id) on delete cascade,
  name               text not null check (char_length(trim(name)) between 2 and 120),
  code               text check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,15}$'),
  type               public.warehouse_type not null default 'cold_storage',
  address_line1      text check (char_length(address_line1) <= 200),
  address_line2      text check (char_length(address_line2) <= 200),
  city               text check (char_length(city) <= 120),
  region             text check (char_length(region) <= 120),
  postal_code        text check (char_length(postal_code) <= 20),
  country_code       char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  timezone           text not null default 'UTC' check (private.is_valid_timezone(timezone)),
  latitude           numeric(9, 6) check (latitude between -90 and 90),
  longitude          numeric(9, 6) check (longitude between -180 and 180),
  contact_name       text check (char_length(contact_name) <= 120),
  contact_email      text check (contact_email = lower(contact_email) and char_length(contact_email) <= 254),
  contact_phone      text check (char_length(contact_phone) <= 32),
  operational_status public.warehouse_status not null default 'operational',
  archived_at        timestamptz,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, company_id)
);

create index warehouses_company_idx on public.warehouses (company_id);
create index warehouses_created_by_idx on public.warehouses (created_by);
create unique index warehouses_active_name_idx
  on public.warehouses (company_id, lower(name)) where archived_at is null;
create unique index warehouses_code_idx
  on public.warehouses (company_id, code) where code is not null;

create trigger warehouses_set_updated_at
  before update on public.warehouses
  for each row execute function private.set_updated_at();

create trigger warehouses_guard_columns
  before update on public.warehouses
  for each row execute function private.guard_immutable_columns('id', 'company_id', 'created_by', 'created_at');

-- -----------------------------------------------------------------------------
-- warehouse_assignments — scopes Warehouse Managers to specific warehouses.
-- The composite FK to company_members guarantees the user is in the company.
-- -----------------------------------------------------------------------------
create table public.warehouse_assignments (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null,
  warehouse_id uuid not null,
  user_id      uuid not null,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (warehouse_id, user_id),
  foreign key (warehouse_id, company_id) references public.warehouses (id, company_id) on delete cascade,
  foreign key (company_id, user_id) references public.company_members (company_id, user_id) on delete cascade
);

create index warehouse_assignments_company_user_idx on public.warehouse_assignments (company_id, user_id);
create index warehouse_assignments_user_idx on public.warehouse_assignments (user_id);
create index warehouse_assignments_created_by_idx on public.warehouse_assignments (created_by);

-- -----------------------------------------------------------------------------
-- storage_zones — rooms, refrigerated areas, freezers inside a warehouse
-- -----------------------------------------------------------------------------
create table public.storage_zones (
  id                          uuid primary key default gen_random_uuid(),
  company_id                  uuid not null,
  warehouse_id                uuid not null,
  name                        text not null check (char_length(trim(name)) between 1 and 120),
  type                        public.zone_type not null default 'refrigerated',
  description                 text check (char_length(description) <= 1000),
  min_temp_c                  numeric(5, 2) check (min_temp_c between -90 and 60),
  max_temp_c                  numeric(5, 2) check (max_temp_c between -90 and 60),
  min_humidity_pct            numeric(5, 2) check (min_humidity_pct between 0 and 100),
  max_humidity_pct            numeric(5, 2) check (max_humidity_pct between 0 and 100),
  monitoring_interval_minutes integer not null default 5 check (monitoring_interval_minutes between 1 and 1440),
  responsible_user_id         uuid,
  archived_at                 timestamptz,
  created_by                  uuid references public.profiles (id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  check (min_temp_c is null or max_temp_c is null or min_temp_c < max_temp_c),
  check (min_humidity_pct is null or max_humidity_pct is null or min_humidity_pct < max_humidity_pct),
  unique (id, company_id),
  unique (id, warehouse_id, company_id),
  foreign key (warehouse_id, company_id) references public.warehouses (id, company_id) on delete cascade,
  foreign key (company_id, responsible_user_id)
    references public.company_members (company_id, user_id) on delete set null (responsible_user_id)
);

create index storage_zones_company_idx on public.storage_zones (company_id);
create index storage_zones_warehouse_idx on public.storage_zones (warehouse_id, company_id);
create index storage_zones_responsible_idx on public.storage_zones (company_id, responsible_user_id);
create index storage_zones_created_by_idx on public.storage_zones (created_by);
create unique index storage_zones_active_name_idx
  on public.storage_zones (warehouse_id, lower(name)) where archived_at is null;

create trigger storage_zones_set_updated_at
  before update on public.storage_zones
  for each row execute function private.set_updated_at();

create trigger storage_zones_guard_columns
  before update on public.storage_zones
  for each row execute function private.guard_immutable_columns('id', 'company_id', 'warehouse_id', 'created_by', 'created_at');

-- -----------------------------------------------------------------------------
-- equipment — refrigeration units, compressors, generators, ...
-- -----------------------------------------------------------------------------
create table public.equipment (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null,
  warehouse_id        uuid not null,
  zone_id             uuid,
  name                text not null check (char_length(trim(name)) between 1 and 120),
  category            text not null check (char_length(trim(category)) between 1 and 60),
  manufacturer        text check (char_length(manufacturer) <= 120),
  model               text check (char_length(model) <= 120),
  serial_number       text check (char_length(serial_number) <= 120),
  installed_on        date,
  warranty_expires_on date,
  status              public.equipment_status not null default 'operational',
  notes               text check (char_length(notes) <= 2000),
  archived_at         timestamptz,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, company_id),
  unique (id, warehouse_id, company_id),
  foreign key (warehouse_id, company_id) references public.warehouses (id, company_id) on delete cascade,
  foreign key (zone_id, warehouse_id, company_id)
    references public.storage_zones (id, warehouse_id, company_id) on delete set null (zone_id)
);

create index equipment_company_idx on public.equipment (company_id);
create index equipment_warehouse_idx on public.equipment (warehouse_id, company_id);
create index equipment_zone_idx on public.equipment (zone_id, warehouse_id, company_id);
create index equipment_created_by_idx on public.equipment (created_by);

create trigger equipment_set_updated_at
  before update on public.equipment
  for each row execute function private.set_updated_at();

create trigger equipment_guard_columns
  before update on public.equipment
  for each row execute function private.guard_immutable_columns('id', 'company_id', 'warehouse_id', 'created_by', 'created_at');

-- -----------------------------------------------------------------------------
-- sensors
-- -----------------------------------------------------------------------------
create table public.sensors (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null,
  warehouse_id       uuid not null,
  zone_id            uuid,
  name               text not null check (char_length(trim(name)) between 1 and 120),
  external_device_id text not null check (external_device_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  type               public.sensor_type not null default 'temperature_humidity',
  manufacturer       text check (char_length(manufacturer) <= 120),
  model              text check (char_length(model) <= 120),
  firmware_version   text check (char_length(firmware_version) <= 64),
  battery_pct        numeric(5, 2) check (battery_pct between 0 and 100),
  signal_rssi        integer check (signal_rssi between -200 and 50),
  metadata           jsonb not null default '{}'::jsonb
                     check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 8192),
  status             public.sensor_status not null default 'registered',
  last_seen_at       timestamptz,
  last_reading_at    timestamptz,
  archived_at        timestamptz,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (company_id, external_device_id),
  unique (id, company_id),
  unique (id, warehouse_id, company_id),
  foreign key (warehouse_id, company_id) references public.warehouses (id, company_id) on delete cascade,
  foreign key (zone_id, warehouse_id, company_id)
    references public.storage_zones (id, warehouse_id, company_id) on delete set null (zone_id)
);

create index sensors_warehouse_idx on public.sensors (warehouse_id, company_id);
create index sensors_zone_idx on public.sensors (zone_id, warehouse_id, company_id);
create index sensors_company_status_idx on public.sensors (company_id, status);
create index sensors_created_by_idx on public.sensors (created_by);

create trigger sensors_set_updated_at
  before update on public.sensors
  for each row execute function private.set_updated_at();

-- Telemetry columns (last_seen_at, battery, ...) are written only by the
-- ingestion service, never by people.
create trigger sensors_guard_columns
  before update on public.sensors
  for each row execute function private.guard_immutable_columns(
    'id', 'company_id', 'warehouse_id', 'created_by', 'created_at',
    'last_seen_at', 'last_reading_at', 'battery_pct', 'signal_rssi', 'firmware_version'
  );

-- -----------------------------------------------------------------------------
-- sensor_api_keys — device credentials. Only the SHA-256 hash is stored;
-- the raw key is shown once at creation.
-- -----------------------------------------------------------------------------
create table public.sensor_api_keys (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null,
  sensor_id    uuid not null,
  name         text check (char_length(name) <= 80),
  key_prefix   text not null check (key_prefix ~ '^[A-Za-z0-9_]{6,24}$'),
  key_hash     text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  expires_at   timestamptz,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  foreign key (sensor_id, company_id) references public.sensors (id, company_id) on delete cascade
);

create index sensor_api_keys_sensor_idx on public.sensor_api_keys (sensor_id, company_id);
create index sensor_api_keys_company_idx on public.sensor_api_keys (company_id);
create index sensor_api_keys_created_by_idx on public.sensor_api_keys (created_by);

-- Only revoked_at and name may change after creation (for API users).
create trigger sensor_api_keys_guard_columns
  before update on public.sensor_api_keys
  for each row execute function private.guard_immutable_columns(
    'id', 'company_id', 'sensor_id', 'key_prefix', 'key_hash', 'expires_at',
    'last_used_at', 'created_by', 'created_at'
  );

-- -----------------------------------------------------------------------------
-- sensor_readings — append-only time series.
-- bigint identity key (not UUID) keeps this high-volume table and its indexes
-- compact. Out-of-range values are kept with quality = 'invalid'.
-- -----------------------------------------------------------------------------
create table public.sensor_readings (
  id            bigint generated always as identity primary key,
  company_id    uuid not null,
  warehouse_id  uuid not null,
  zone_id       uuid,
  sensor_id     uuid not null,
  recorded_at   timestamptz not null,
  received_at   timestamptz not null default now(),
  temperature_c numeric(6, 2),
  humidity_pct  numeric(6, 2),
  source        public.reading_source not null default 'device',
  quality       public.reading_quality not null default 'ok',
  recorded_by   uuid references public.profiles (id) on delete set null,
  check (temperature_c is not null or humidity_pct is not null),
  check (quality = 'invalid' or temperature_c is null or temperature_c between -90 and 60),
  check (quality = 'invalid' or humidity_pct is null or humidity_pct between 0 and 100),
  check (source = 'manual' or recorded_by is null),
  unique (sensor_id, recorded_at),
  -- The sensor, the warehouse and the zone must all belong to the same company.
  foreign key (sensor_id, warehouse_id, company_id)
    references public.sensors (id, warehouse_id, company_id) on delete cascade,
  foreign key (warehouse_id, company_id) references public.warehouses (id, company_id) on delete cascade,
  foreign key (zone_id, warehouse_id, company_id)
    references public.storage_zones (id, warehouse_id, company_id) on delete set null (zone_id)
);

-- unique (sensor_id, recorded_at) already serves "latest readings per sensor"
-- and the sensor foreign key lookups.
create index sensor_readings_zone_time_idx on public.sensor_readings (zone_id, recorded_at desc);
create index sensor_readings_warehouse_time_idx on public.sensor_readings (warehouse_id, recorded_at desc);
create index sensor_readings_company_time_idx on public.sensor_readings (company_id, recorded_at desc);
create index sensor_readings_recorded_brin on public.sensor_readings using brin (recorded_at);
create index sensor_readings_recorded_by_idx on public.sensor_readings (recorded_by) where recorded_by is not null;

-- >>> 0004_alerts_incidents_maintenance.sql
-- =============================================================================
-- ColdChain OS · 0004_alerts_incidents_maintenance
-- =============================================================================

-- -----------------------------------------------------------------------------
-- alerts — raised by the engine (ingestion + cron sweep), handled by people.
-- dedupe_key prevents a second open alert for the same zone/sensor + type.
-- -----------------------------------------------------------------------------
create table public.alerts (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies (id) on delete cascade,
  warehouse_id      uuid not null,
  zone_id           uuid,
  sensor_id         uuid,
  equipment_id      uuid,
  type              public.alert_type not null,
  severity          public.alert_severity not null default 'warning',
  status            public.alert_status not null default 'open',
  dedupe_key        text not null check (char_length(dedupe_key) between 1 and 200),
  title             text not null check (char_length(title) between 1 and 200),
  message           text check (char_length(message) <= 2000),
  reading_id        bigint references public.sensor_readings (id) on delete set null,
  observed_value    numeric(8, 2),
  threshold_value   numeric(8, 2),
  trigger_count     integer not null default 1 check (trigger_count >= 1),
  opened_at         timestamptz not null default now(),
  last_triggered_at timestamptz not null default now(),
  assigned_to       uuid,
  acknowledged_by   uuid references public.profiles (id) on delete set null,
  acknowledged_at   timestamptz,
  resolved_by       uuid references public.profiles (id) on delete set null,
  resolved_at       timestamptz,
  resolution_notes  text check (char_length(resolution_notes) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, company_id),
  foreign key (warehouse_id, company_id) references public.warehouses (id, company_id) on delete cascade,
  foreign key (zone_id, warehouse_id, company_id)
    references public.storage_zones (id, warehouse_id, company_id) on delete set null (zone_id),
  foreign key (sensor_id, warehouse_id, company_id)
    references public.sensors (id, warehouse_id, company_id) on delete set null (sensor_id),
  foreign key (equipment_id, warehouse_id, company_id)
    references public.equipment (id, warehouse_id, company_id) on delete set null (equipment_id),
  foreign key (company_id, assigned_to)
    references public.company_members (company_id, user_id) on delete set null (assigned_to)
);

create unique index alerts_open_dedupe_idx
  on public.alerts (company_id, dedupe_key) where status <> 'resolved';
create index alerts_company_status_idx on public.alerts (company_id, status, opened_at desc);
create index alerts_warehouse_status_idx on public.alerts (warehouse_id, status);
create index alerts_zone_idx on public.alerts (zone_id, warehouse_id, company_id);
create index alerts_sensor_idx on public.alerts (sensor_id, warehouse_id, company_id);
create index alerts_equipment_idx on public.alerts (equipment_id, warehouse_id, company_id);
create index alerts_reading_idx on public.alerts (reading_id);
create index alerts_assigned_idx on public.alerts (company_id, assigned_to);
create index alerts_acknowledged_by_idx on public.alerts (acknowledged_by);
create index alerts_resolved_by_idx on public.alerts (resolved_by);

create trigger alerts_set_updated_at
  before update on public.alerts
  for each row execute function private.set_updated_at();

-- People may change status, assignment and resolution notes; everything the
-- engine measured is immutable for them.
create trigger alerts_a_guard_columns
  before update on public.alerts
  for each row execute function private.guard_immutable_columns(
    'id', 'company_id', 'warehouse_id', 'zone_id', 'sensor_id', 'equipment_id', 'type', 'severity',
    'dedupe_key', 'title', 'message', 'reading_id', 'observed_value', 'threshold_value',
    'trigger_count', 'opened_at', 'last_triggered_at', 'acknowledged_by', 'acknowledged_at',
    'resolved_by', 'resolved_at', 'created_at'
  );

-- -----------------------------------------------------------------------------
-- alert_events — complete alert history, written only by triggers
-- -----------------------------------------------------------------------------
create table public.alert_events (
  id          bigint generated always as identity primary key,
  company_id  uuid not null,
  alert_id    uuid not null,
  event_type  public.alert_event_type not null,
  actor_id    uuid references public.profiles (id) on delete set null,
  from_status public.alert_status,
  to_status   public.alert_status,
  assigned_to uuid references public.profiles (id) on delete set null,
  note        text check (char_length(note) <= 2000),
  created_at  timestamptz not null default now(),
  foreign key (alert_id, company_id) references public.alerts (id, company_id) on delete cascade
);

create index alert_events_alert_idx on public.alert_events (alert_id, company_id, created_at);
create index alert_events_company_idx on public.alert_events (company_id, created_at desc);
create index alert_events_actor_idx on public.alert_events (actor_id);
create index alert_events_assigned_idx on public.alert_events (assigned_to);

-- -----------------------------------------------------------------------------
-- incidents
-- -----------------------------------------------------------------------------
create table public.incidents (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies (id) on delete cascade,
  warehouse_id      uuid not null,
  zone_id           uuid,
  alert_id          uuid,
  title             text not null check (char_length(trim(title)) between 3 and 200),
  description       text check (char_length(description) <= 5000),
  severity          public.alert_severity not null default 'warning',
  status            public.incident_status not null default 'open',
  occurred_at       timestamptz not null default now(),
  reported_by       uuid references public.profiles (id) on delete set null,
  assigned_to       uuid,
  root_cause        text check (char_length(root_cause) <= 5000),
  corrective_action text check (char_length(corrective_action) <= 5000),
  resolution        text check (char_length(resolution) <= 5000),
  resolved_at       timestamptz,
  closed_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, company_id),
  foreign key (warehouse_id, company_id) references public.warehouses (id, company_id) on delete cascade,
  foreign key (zone_id, warehouse_id, company_id)
    references public.storage_zones (id, warehouse_id, company_id) on delete set null (zone_id),
  foreign key (alert_id, company_id)
    references public.alerts (id, company_id) on delete set null (alert_id),
  foreign key (company_id, assigned_to)
    references public.company_members (company_id, user_id) on delete set null (assigned_to)
);

create index incidents_company_status_idx on public.incidents (company_id, status, occurred_at desc);
create index incidents_warehouse_idx on public.incidents (warehouse_id, company_id);
create index incidents_zone_idx on public.incidents (zone_id, warehouse_id, company_id);
create index incidents_alert_idx on public.incidents (alert_id, company_id);
create index incidents_assigned_idx on public.incidents (company_id, assigned_to);
create index incidents_reported_by_idx on public.incidents (reported_by);

create trigger incidents_set_updated_at
  before update on public.incidents
  for each row execute function private.set_updated_at();

create trigger incidents_a_guard_columns
  before update on public.incidents
  for each row execute function private.guard_immutable_columns(
    'id', 'company_id', 'warehouse_id', 'reported_by', 'resolved_at', 'closed_at', 'created_at'
  );

-- -----------------------------------------------------------------------------
-- incident_updates — timeline; status changes are added automatically
-- -----------------------------------------------------------------------------
create table public.incident_updates (
  id          bigint generated always as identity primary key,
  company_id  uuid not null,
  incident_id uuid not null,
  author_id   uuid references public.profiles (id) on delete set null,
  body        text check (char_length(body) <= 5000),
  from_status public.incident_status,
  to_status   public.incident_status,
  created_at  timestamptz not null default now(),
  check (body is not null or to_status is not null),
  foreign key (incident_id, company_id) references public.incidents (id, company_id) on delete cascade
);

create index incident_updates_incident_idx on public.incident_updates (incident_id, company_id, created_at);
create index incident_updates_author_idx on public.incident_updates (author_id);

-- -----------------------------------------------------------------------------
-- incident_attachments — files live in the private `incident-attachments`
-- bucket at  <company_id>/<incident_id>/<file>
-- -----------------------------------------------------------------------------
create table public.incident_attachments (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null,
  incident_id  uuid not null,
  storage_path text not null unique check (char_length(storage_path) <= 512),
  file_name    text not null check (char_length(file_name) between 1 and 255),
  mime_type    text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes   integer not null check (size_bytes between 1 and 10485760),
  uploaded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  check (storage_path like company_id::text || '/' || incident_id::text || '/%'),
  foreign key (incident_id, company_id) references public.incidents (id, company_id) on delete cascade
);

create index incident_attachments_incident_idx on public.incident_attachments (incident_id, company_id);
create index incident_attachments_uploaded_by_idx on public.incident_attachments (uploaded_by);

-- -----------------------------------------------------------------------------
-- maintenance_schedules — recurring work per piece of equipment
-- -----------------------------------------------------------------------------
create table public.maintenance_schedules (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  warehouse_id  uuid not null,
  equipment_id  uuid not null,
  title         text not null check (char_length(trim(title)) between 3 and 200),
  description   text check (char_length(description) <= 2000),
  interval_days integer not null check (interval_days between 1 and 3650),
  next_due_at   timestamptz not null,
  assigned_to   uuid,
  is_active     boolean not null default true,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, company_id),
  foreign key (equipment_id, warehouse_id, company_id)
    references public.equipment (id, warehouse_id, company_id) on delete cascade,
  foreign key (company_id, assigned_to)
    references public.company_members (company_id, user_id) on delete set null (assigned_to)
);

create index maintenance_schedules_equipment_idx on public.maintenance_schedules (equipment_id, warehouse_id, company_id);
create index maintenance_schedules_due_idx on public.maintenance_schedules (company_id, next_due_at) where is_active;
create index maintenance_schedules_warehouse_idx on public.maintenance_schedules (warehouse_id);
create index maintenance_schedules_assigned_idx on public.maintenance_schedules (company_id, assigned_to);
create index maintenance_schedules_created_by_idx on public.maintenance_schedules (created_by);

create trigger maintenance_schedules_set_updated_at
  before update on public.maintenance_schedules
  for each row execute function private.set_updated_at();

create trigger maintenance_schedules_guard_columns
  before update on public.maintenance_schedules
  for each row execute function private.guard_immutable_columns(
    'id', 'company_id', 'warehouse_id', 'equipment_id', 'created_by', 'created_at'
  );

-- -----------------------------------------------------------------------------
-- maintenance_tasks
-- -----------------------------------------------------------------------------
create table public.maintenance_tasks (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null,
  warehouse_id uuid not null,
  equipment_id uuid not null,
  schedule_id  uuid,
  title        text not null check (char_length(trim(title)) between 3 and 200),
  description  text check (char_length(description) <= 2000),
  assigned_to  uuid,
  due_at       timestamptz not null,
  status       public.maintenance_status not null default 'pending',
  notes        text check (char_length(notes) <= 5000),
  completed_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (equipment_id, warehouse_id, company_id)
    references public.equipment (id, warehouse_id, company_id) on delete cascade,
  foreign key (schedule_id, company_id)
    references public.maintenance_schedules (id, company_id) on delete set null (schedule_id),
  foreign key (company_id, assigned_to)
    references public.company_members (company_id, user_id) on delete set null (assigned_to)
);

create index maintenance_tasks_company_status_idx on public.maintenance_tasks (company_id, status, due_at);
create index maintenance_tasks_equipment_idx on public.maintenance_tasks (equipment_id, warehouse_id, company_id);
create index maintenance_tasks_warehouse_idx on public.maintenance_tasks (warehouse_id);
create index maintenance_tasks_schedule_idx on public.maintenance_tasks (schedule_id, company_id);
create index maintenance_tasks_assigned_idx on public.maintenance_tasks (company_id, assigned_to);
create index maintenance_tasks_completed_by_idx on public.maintenance_tasks (completed_by);
create index maintenance_tasks_created_by_idx on public.maintenance_tasks (created_by);

create trigger maintenance_tasks_set_updated_at
  before update on public.maintenance_tasks
  for each row execute function private.set_updated_at();

create trigger maintenance_tasks_a_guard_columns
  before update on public.maintenance_tasks
  for each row execute function private.guard_immutable_columns(
    'id', 'company_id', 'warehouse_id', 'equipment_id', 'schedule_id',
    'completed_by', 'completed_at', 'created_by', 'created_at'
  );

-- -----------------------------------------------------------------------------
-- inspections
-- -----------------------------------------------------------------------------
create table public.inspections (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null,
  warehouse_id      uuid not null,
  zone_id           uuid,
  equipment_id      uuid,
  inspector_id      uuid references public.profiles (id) on delete set null,
  inspected_at      timestamptz not null default now(),
  result            public.inspection_result not null,
  findings          text check (char_length(findings) <= 5000),
  corrective_action text check (char_length(corrective_action) <= 5000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (zone_id is not null or equipment_id is not null),
  foreign key (warehouse_id, company_id) references public.warehouses (id, company_id) on delete cascade,
  foreign key (zone_id, warehouse_id, company_id)
    references public.storage_zones (id, warehouse_id, company_id) on delete cascade,
  foreign key (equipment_id, warehouse_id, company_id)
    references public.equipment (id, warehouse_id, company_id) on delete cascade
);

create index inspections_company_time_idx on public.inspections (company_id, inspected_at desc);
create index inspections_warehouse_idx on public.inspections (warehouse_id, company_id);
create index inspections_zone_idx on public.inspections (zone_id, warehouse_id, company_id);
create index inspections_equipment_idx on public.inspections (equipment_id, warehouse_id, company_id);
create index inspections_inspector_idx on public.inspections (inspector_id);

create trigger inspections_set_updated_at
  before update on public.inspections
  for each row execute function private.set_updated_at();

create trigger inspections_guard_columns
  before update on public.inspections
  for each row execute function private.guard_immutable_columns(
    'id', 'company_id', 'warehouse_id', 'inspector_id', 'created_at'
  );

-- >>> 0005_reporting_audit_notifications.sql
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

-- >>> 0006_billing.sql
-- =============================================================================
-- ColdChain OS · 0006_billing
-- Amounts are stored as integer minor units (cents) to avoid rounding errors.
-- Prices live only in subscription_plans and are edited from the super admin.
-- =============================================================================

create table public.subscription_plans (
  id                       uuid primary key default gen_random_uuid(),
  code                     text not null unique check (code ~ '^[a-z0-9_]{2,32}$'),
  name                     text not null check (char_length(name) between 2 and 60),
  description              text check (char_length(description) <= 500),
  currency                 char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  monthly_price_cents      integer check (monthly_price_cents >= 0),
  annual_price_cents       integer check (annual_price_cents >= 0),
  setup_fee_cents          integer not null default 0 check (setup_fee_cents >= 0),
  -- null = unlimited
  max_warehouses           integer check (max_warehouses > 0),
  max_zones                integer check (max_zones > 0),
  max_sensors              integer check (max_sensors > 0),
  max_users                integer check (max_users > 0),
  features                 jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  razorpay_plan_id_monthly text check (char_length(razorpay_plan_id_monthly) <= 64),
  razorpay_plan_id_annual  text check (char_length(razorpay_plan_id_annual) <= 64),
  is_active                boolean not null default true,
  is_public                boolean not null default true,
  -- true = "contact sales" instead of self-serve checkout
  requires_contact         boolean not null default false,
  sort_order               integer not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create trigger subscription_plans_set_updated_at
  before update on public.subscription_plans
  for each row execute function private.set_updated_at();

create table public.customer_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references public.companies (id) on delete cascade,
  plan_id                  uuid not null references public.subscription_plans (id) on delete restrict,
  billing_interval         public.billing_interval not null,
  provider                 text not null default 'razorpay' check (provider ~ '^[a-z0-9_]{2,20}$'),
  provider_subscription_id text check (char_length(provider_subscription_id) <= 64),
  provider_customer_id     text check (char_length(provider_customer_id) <= 64),
  provider_plan_id         text check (char_length(provider_plan_id) <= 64),
  status                   public.subscription_status not null default 'incomplete',
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  cancelled_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (id, company_id),
  unique (provider, provider_subscription_id)
);

-- At most one live subscription per company.
create unique index customer_subscriptions_live_idx
  on public.customer_subscriptions (company_id)
  where status in ('incomplete', 'trialing', 'active', 'past_due', 'paused');
create index customer_subscriptions_company_idx on public.customer_subscriptions (company_id, created_at desc);
create index customer_subscriptions_plan_idx on public.customer_subscriptions (plan_id);

create trigger customer_subscriptions_set_updated_at
  before update on public.customer_subscriptions
  for each row execute function private.set_updated_at();

create table public.payment_records (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id) on delete cascade,
  subscription_id     uuid,
  provider            text not null default 'razorpay' check (provider ~ '^[a-z0-9_]{2,20}$'),
  provider_order_id   text check (char_length(provider_order_id) <= 64),
  provider_payment_id text check (char_length(provider_payment_id) <= 64),
  amount_cents        integer not null check (amount_cents > 0),
  currency            char(3) not null check (currency ~ '^[A-Z]{3}$'),
  purpose             public.payment_purpose not null,
  status              public.payment_status not null default 'created',
  method              text check (char_length(method) <= 40),
  failure_reason      text check (char_length(failure_reason) <= 500),
  captured_at         timestamptz,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, company_id),
  unique (provider, provider_order_id),
  unique (provider, provider_payment_id),
  foreign key (subscription_id, company_id)
    references public.customer_subscriptions (id, company_id) on delete set null (subscription_id)
);

create index payment_records_company_idx on public.payment_records (company_id, created_at desc);
create index payment_records_subscription_idx on public.payment_records (subscription_id, company_id);
create index payment_records_created_by_idx on public.payment_records (created_by);

create trigger payment_records_set_updated_at
  before update on public.payment_records
  for each row execute function private.set_updated_at();

create table public.refunds (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null,
  payment_id         uuid not null,
  amount_cents       integer not null check (amount_cents > 0),
  currency           char(3) not null check (currency ~ '^[A-Z]{3}$'),
  reason             text check (char_length(reason) <= 500),
  provider_refund_id text unique check (char_length(provider_refund_id) <= 64),
  status             public.refund_status not null default 'pending',
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (payment_id, company_id) references public.payment_records (id, company_id) on delete cascade
);

create index refunds_payment_idx on public.refunds (payment_id, company_id);
create index refunds_company_idx on public.refunds (company_id);
create index refunds_created_by_idx on public.refunds (created_by);

create trigger refunds_set_updated_at
  before update on public.refunds
  for each row execute function private.set_updated_at();

-- Sequential, gap-tolerant invoice numbers: CCO-2026-000001
create sequence public.invoice_number_seq as bigint start 1;

create table public.invoices (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete cascade,
  payment_id       uuid,
  number           text not null unique
                   default ('CCO-' || to_char(now() at time zone 'UTC', 'YYYY') || '-' ||
                            lpad(nextval('public.invoice_number_seq')::text, 6, '0')),
  currency         char(3) not null check (currency ~ '^[A-Z]{3}$'),
  line_items       jsonb not null default '[]'::jsonb check (jsonb_typeof(line_items) = 'array'),
  subtotal_cents   integer not null check (subtotal_cents >= 0),
  tax_cents        integer not null default 0 check (tax_cents >= 0),
  total_cents      integer not null check (total_cents >= 0),
  -- Company name, address and VAT number frozen at the time of issue
  billing_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(billing_snapshot) = 'object'),
  status           public.invoice_status not null default 'issued',
  issued_at        timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (total_cents = subtotal_cents + tax_cents),
  foreign key (payment_id, company_id)
    references public.payment_records (id, company_id) on delete set null (payment_id)
);

create index invoices_company_idx on public.invoices (company_id, issued_at desc);
create index invoices_payment_idx on public.invoices (payment_id, company_id);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function private.set_updated_at();

-- Raw webhook events, keyed by provider event id for idempotency.
create table public.payment_webhook_events (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null default 'razorpay' check (provider ~ '^[a-z0-9_]{2,20}$'),
  event_id        text not null check (char_length(event_id) between 1 and 128),
  event_type      text not null check (char_length(event_type) between 1 and 80),
  payload         jsonb not null,
  signature_valid boolean not null,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  error           text check (char_length(error) <= 2000),
  unique (provider, event_id)
);

create index payment_webhook_events_unprocessed_idx
  on public.payment_webhook_events (received_at) where processed_at is null;

-- >>> 0007_platform.sql
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

-- >>> 0008_access_helpers.sql
-- =============================================================================
-- ColdChain OS · 0008_access_helpers
-- SECURITY DEFINER helpers used by RLS policies. They read membership tables
-- without recursing into those tables' own policies. All are STABLE, pin
-- search_path, and live in the unexposed `private` schema.
-- =============================================================================

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_company_role(p_company_id uuid, p_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

-- Set-returning variants: used as  company_id in (select private.member_company_ids(...))
-- so Postgres evaluates them once per query instead of once per row.
create or replace function private.member_company_ids(p_roles public.member_role[] default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.company_id from public.company_members m
  where m.user_id = (select auth.uid())
    and (p_roles is null or m.role = any (p_roles));
$$;

-- Warehouses the current user may configure: every warehouse of companies
-- where they are Owner/Admin, plus warehouses assigned to them as Manager.
create or replace function private.managed_warehouse_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select w.id
  from public.warehouses w
  join public.company_members m
    on m.company_id = w.company_id and m.user_id = (select auth.uid())
  where m.role in ('owner', 'admin')
     or (
       m.role = 'warehouse_manager'
       and exists (
         select 1 from public.warehouse_assignments wa
         where wa.warehouse_id = w.id and wa.user_id = m.user_id
       )
     );
$$;

create or replace function private.can_manage_warehouse(p_warehouse_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_warehouse_id in (select private.managed_warehouse_ids());
$$;

-- Users who share at least one company with the current user (team lists).
create or replace function private.colleague_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct other.user_id
  from public.company_members mine
  join public.company_members other on other.company_id = mine.company_id
  where mine.user_id = (select auth.uid());
$$;

revoke all on function private.is_platform_admin() from public;
revoke all on function private.is_company_member(uuid) from public;
revoke all on function private.has_company_role(uuid, public.member_role[]) from public;
revoke all on function private.member_company_ids(public.member_role[]) from public;
revoke all on function private.managed_warehouse_ids() from public;
revoke all on function private.can_manage_warehouse(uuid) from public;
revoke all on function private.colleague_ids() from public;

grant execute on function private.is_platform_admin() to authenticated, service_role;
grant execute on function private.is_company_member(uuid) to authenticated, service_role;
grant execute on function private.has_company_role(uuid, public.member_role[]) to authenticated, service_role;
grant execute on function private.member_company_ids(public.member_role[]) to authenticated, service_role;
grant execute on function private.managed_warehouse_ids() to authenticated, service_role;
grant execute on function private.can_manage_warehouse(uuid) to authenticated, service_role;
grant execute on function private.colleague_ids() to authenticated, service_role;

-- >>> 0009_rls_policies.sql
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

-- >>> 0010_business_rules.sql
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

-- >>> 0011_audit_trail.sql
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

-- >>> 0012_tenancy_functions.sql
-- =============================================================================
-- ColdChain OS · 0012_tenancy_functions
-- RPCs that change tenancy atomically. Each validates the caller itself;
-- they are SECURITY DEFINER because they write rows the caller cannot
-- write directly (owner membership, accepted invitations).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_company — new tenant + the caller as Owner, trial started
-- -----------------------------------------------------------------------------
create or replace function public.create_company(
  p_name                text,
  p_country_code        text,
  p_vat_number          text default null,
  p_registration_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_trial_days integer;
  v_company_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  -- Abuse guard: at most 3 companies created per user per day.
  if (
    select count(*) from public.companies
    where created_by = v_uid and created_at > now() - interval '1 day'
  ) >= 3 then
    raise exception 'Too many companies created today' using errcode = '54000';
  end if;

  select coalesce((value #>> '{}')::integer, 14) into v_trial_days
  from public.app_settings where key = 'trial_days';

  insert into public.companies (name, country_code, vat_number, registration_number, status, trial_ends_at, created_by)
  values (
    trim(p_name),
    upper(trim(p_country_code)),
    nullif(trim(p_vat_number), ''),
    nullif(trim(p_registration_number), ''),
    'trial',
    now() + make_interval(days => coalesce(v_trial_days, 14)),
    v_uid
  )
  returning id into v_company_id;

  insert into public.company_members (company_id, user_id, role)
  values (v_company_id, v_uid, 'owner');

  return v_company_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- get_invitation — preview for the /invite/[token] page (works signed out)
-- -----------------------------------------------------------------------------
create or replace function public.get_invitation(p_token text)
returns table (
  company_name text,
  email        text,
  role         public.member_role,
  expires_at   timestamptz,
  state        text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.name,
    i.email,
    i.role,
    i.expires_at,
    case
      when i.revoked_at is not null then 'revoked'
      when i.accepted_at is not null then 'accepted'
      when i.expires_at <= now() then 'expired'
      else 'pending'
    end
  from public.company_invitations i
  join public.companies c on c.id = i.company_id
  where p_token is not null
    and length(p_token) between 32 and 256
    and i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

-- -----------------------------------------------------------------------------
-- accept_invitation — the signed-in user, with a verified e-mail matching the
-- invitation, joins the company with the invited role.
-- -----------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_email      text;
  v_confirmed  timestamptz;
  v_invitation public.company_invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  if p_token is null or length(p_token) not between 32 and 256 then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;

  select lower(u.email), u.email_confirmed_at into v_email, v_confirmed
  from auth.users u where u.id = v_uid;

  if v_confirmed is null then
    raise exception 'Verify your e-mail address before accepting the invitation' using errcode = '42501';
  end if;

  select * into v_invitation
  from public.company_invitations
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update;

  if not found or v_invitation.revoked_at is not null then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if v_invitation.accepted_at is not null then
    raise exception 'Invitation already used' using errcode = '22023';
  end if;
  if v_invitation.expires_at <= now() then
    raise exception 'Invitation expired' using errcode = '22023';
  end if;
  if v_invitation.email <> v_email then
    raise exception 'This invitation was sent to a different e-mail address' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.company_members
    where company_id = v_invitation.company_id and user_id = v_uid
  ) then
    raise exception 'You are already a member of this company' using errcode = '23505';
  end if;

  insert into public.company_members (company_id, user_id, role, invited_by)
  values (v_invitation.company_id, v_uid, v_invitation.role, v_invitation.invited_by);

  update public.company_invitations
  set accepted_at = now(), accepted_by = v_uid
  where id = v_invitation.id;

  return v_invitation.company_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- transfer_ownership — current Owner hands over to another member and
-- becomes Admin. Exactly one Owner exists at every moment.
-- -----------------------------------------------------------------------------
create or replace function public.transfer_ownership(p_company_id uuid, p_new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.company_members
    where company_id = p_company_id and user_id = v_uid and role = 'owner'
    for update
  ) then
    raise exception 'Only the owner can transfer ownership' using errcode = '42501';
  end if;

  if p_new_owner_id = v_uid then
    raise exception 'You already own this company' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.company_members
    where company_id = p_company_id and user_id = p_new_owner_id
    for update
  ) then
    raise exception 'The new owner must already be a member of the company' using errcode = '22023';
  end if;

  update public.company_members set role = 'admin'
  where company_id = p_company_id and user_id = v_uid;

  update public.company_members set role = 'owner'
  where company_id = p_company_id and user_id = p_new_owner_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Execute privileges
-- -----------------------------------------------------------------------------
revoke all on function public.create_company(text, text, text, text) from public, anon;
revoke all on function public.get_invitation(text) from public;
revoke all on function public.accept_invitation(text) from public, anon;
revoke all on function public.transfer_ownership(uuid, uuid) from public, anon;

grant execute on function public.create_company(text, text, text, text) to authenticated;
grant execute on function public.get_invitation(text) to anon, authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;

-- >>> 0013_storage.sql
-- =============================================================================
-- ColdChain OS · 0013_storage
-- Private bucket for incident photos/PDFs. Path: <company_id>/<incident_id>/<file>
-- Files are served only through short-lived signed URLs.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'incident-attachments',
  'incident-attachments',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public             = false,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy cco_incident_attachments_select on storage.objects for select to authenticated
  using (
    bucket_id = 'incident-attachments'
    and (storage.foldername(name))[1] in (
      select c::text from private.member_company_ids() as c
    )
  );

create policy cco_incident_attachments_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'incident-attachments'
    and exists (
      select 1 from public.incidents i
      where i.company_id::text = (storage.foldername(name))[1]
        and i.id::text = (storage.foldername(name))[2]
        and i.company_id in (select private.member_company_ids(
          array['owner', 'admin', 'warehouse_manager', 'operator']::public.member_role[]
        ))
    )
  );

create policy cco_incident_attachments_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'incident-attachments'
    and (
      (storage.foldername(name))[1] in (
        select c::text from private.member_company_ids(array['owner', 'admin']::public.member_role[]) as c
      )
      or (
        owner_id = (select auth.uid())::text
        and (storage.foldername(name))[1] in (
          select c::text from private.member_company_ids(
            array['owner', 'admin', 'warehouse_manager', 'operator']::public.member_role[]
          ) as c
        )
      )
    )
  );

-- >>> plans.sql
-- =============================================================================
-- ColdChain OS · seed/plans.sql
-- Starting price list. Run once after the migrations. Re-running never
-- overwrites prices already edited in the super admin.
--
-- DEFAULT PRICES — review before Stage 5 (payments). Amounts are in cents.
-- =============================================================================

insert into public.subscription_plans (
  code, name, description, currency,
  monthly_price_cents, annual_price_cents, setup_fee_cents,
  max_warehouses, max_zones, max_sensors, max_users,
  features, requires_contact, sort_order
) values
(
  'starter', 'Starter', 'One site, fully monitored.', 'USD',
  14900, 149000, 29900,
  1, 10, 25, 5,
  '["Live temperature & humidity monitoring", "Threshold alerts", "Incident log with photos", "CSV & PDF reports", "Audit trail"]'::jsonb,
  false, 10
),
(
  'professional', 'Professional', 'Multi-site operations with maintenance and inspections.', 'USD',
  44900, 449000, 79900,
  5, 60, 150, 25,
  '["Everything in Starter", "Up to 5 warehouses", "Maintenance schedules & inspections", "Warehouse-scoped managers", "Priority support"]'::jsonb,
  false, 20
),
(
  'enterprise', 'Enterprise', 'Custom limits, onboarding and integrations.', 'USD',
  null, null, 0,
  null, null, null, null,
  '["Everything in Professional", "Unlimited warehouses & sensors", "Custom integrations", "Dedicated onboarding", "SLA"]'::jsonb,
  true, 30
)
on conflict (code) do nothing;
