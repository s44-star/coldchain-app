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
