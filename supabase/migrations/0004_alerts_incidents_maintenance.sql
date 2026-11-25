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
