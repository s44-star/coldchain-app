-- =============================================================================
-- Tenancy, role matrix and RLS tests. Every block is one transaction; the
-- impersonated role resets when the block ends.
-- =============================================================================

create table tests.ctx (key text primary key, id uuid not null);
grant select, insert, update on tests.ctx to anon, authenticated, service_role;

create function tests.id(p_key text) returns uuid
language sql stable as $$ select id from tests.ctx where key = p_key $$;
create function tests.put(p_key text, p_id uuid) returns void
language sql as $$ insert into tests.ctx values (p_key, p_id) on conflict (key) do update set id = excluded.id $$;
grant execute on function tests.id(text), tests.put(text, uuid) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Users
-- -----------------------------------------------------------------------------
do $$ begin
  perform tests.create_user('a0000000-0000-4000-8000-000000000001', 'owner.a@example.com');
  perform tests.create_user('a0000000-0000-4000-8000-000000000002', 'Admin.A@Example.com');
  perform tests.create_user('a0000000-0000-4000-8000-000000000003', 'manager.a@example.com');
  perform tests.create_user('a0000000-0000-4000-8000-000000000004', 'operator.a@example.com');
  perform tests.create_user('a0000000-0000-4000-8000-000000000005', 'viewer.a@example.com');
  perform tests.create_user('b0000000-0000-4000-8000-000000000001', 'owner.b@example.com');
  perform tests.create_user('c0000000-0000-4000-8000-000000000001', 'outsider@example.com');
  perform tests.create_user('d0000000-0000-4000-8000-000000000001', 'platform@example.com');
  perform tests.create_user('e0000000-0000-4000-8000-000000000001', 'late.joiner@example.com', false);
end $$;

insert into public.platform_admins (user_id, note) values ('d0000000-0000-4000-8000-000000000001', 'test');

do $$ begin
  perform tests.eq($q$ select count(*) from public.profiles $q$, 9, 'profiles created by auth trigger');
  perform tests.eq($q$ select count(*) from public.profiles where email = 'admin.a@example.com' $q$, 1, 'profile e-mail lower-cased');
end $$;

-- -----------------------------------------------------------------------------
-- Company creation
-- -----------------------------------------------------------------------------
do $$
declare v uuid;
begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000001');
  v := public.create_company('Alpha Cold Logistics', 'nl', 'NL123456789B01');
  perform tests.put('company_a', v);
  perform tests.eq($q$ select count(*) from public.companies $q$, 1, 'owner A sees own company');
  perform tests.eq(format($q$ select count(*) from public.companies where id = %L and status = 'trial' and trial_ends_at > now() + interval '13 days' $q$, v), 1, 'company starts on 14-day trial');
  perform tests.eq(format($q$ select count(*) from public.company_members where company_id = %L and role = 'owner' $q$, v), 1, 'creator is owner');
end $$;

do $$
declare v uuid;
begin
  perform tests.as_user('b0000000-0000-4000-8000-000000000001');
  v := public.create_company('Bravo Pharma Storage', 'DE');
  perform tests.put('company_b', v);
  perform tests.eq($q$ select count(*) from public.companies $q$, 1, 'owner B sees only own company');
end $$;

do $$ begin
  perform tests.as_anon();
  perform tests.throws($q$ select public.create_company('Anon Co', 'FR') $q$, 'anon cannot create company');
end $$;

do $$ begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000001');
  perform tests.throws($q$ insert into public.companies (name, country_code) values ('Direct', 'NL') $q$, 'companies cannot be inserted directly');
  perform tests.throws($q$ select public.create_company('X', 'NL') $q$, 'company name too short', 'check');
end $$;

-- -----------------------------------------------------------------------------
-- Members: admin joins through an invitation; others are added directly
-- -----------------------------------------------------------------------------
do $$ begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000001');
  insert into public.company_invitations (company_id, email, role, token_hash, expires_at)
  values (tests.id('company_a'), 'admin.a@example.com', 'admin',
          encode(sha256(convert_to('invite-token-for-admin-a-0123456789abcdef', 'UTF8')), 'hex'),
          now() + interval '7 days');
  perform tests.eq($q$ select count(*) from public.company_invitations where invited_by = 'a0000000-0000-4000-8000-000000000001' $q$, 1, 'invited_by stamped from session');
  perform tests.throws(format($q$ insert into public.company_invitations (company_id, email, role, token_hash, expires_at) values (%L, 'x@example.com', 'owner', repeat('a', 64), now() + interval '1 day') $q$, tests.id('company_a')), 'cannot invite an owner');
  perform tests.throws(format($q$ insert into public.company_invitations (company_id, email, role, token_hash, expires_at) values (%L, 'x@example.com', 'viewer', repeat('b', 64), now() + interval '90 days') $q$, tests.id('company_a')), 'invitation expiry capped at 30 days');
end $$;

do $$ begin
  perform tests.as_user('b0000000-0000-4000-8000-000000000001');
  perform tests.throws(format($q$ insert into public.company_invitations (company_id, email, role, token_hash, expires_at) values (%L, 'spy@example.com', 'admin', repeat('c', 64), now() + interval '1 day') $q$, tests.id('company_a')), 'owner B cannot invite into company A');
  perform tests.eq($q$ select count(*) from public.company_invitations $q$, 0, 'owner B cannot read company A invitations');
end $$;

do $$ begin
  perform tests.as_anon();
  perform tests.eq($q$ select count(*) from public.get_invitation('invite-token-for-admin-a-0123456789abcdef') where state = 'pending' and company_name = 'Alpha Cold Logistics' $q$, 1, 'anon can preview an invitation by token');
  perform tests.eq($q$ select count(*) from public.get_invitation('wrong-token-wrong-token-wrong-token-000') $q$, 0, 'wrong token previews nothing');
end $$;

do $$ begin
  perform tests.as_user('c0000000-0000-4000-8000-000000000001');
  perform tests.throws($q$ select public.accept_invitation('invite-token-for-admin-a-0123456789abcdef') $q$, 'other e-mail cannot accept invitation', 'different e-mail');
end $$;

do $$ begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000002');
  perform public.accept_invitation('invite-token-for-admin-a-0123456789abcdef');
  perform tests.eq(format($q$ select count(*) from public.company_members where company_id = %L and user_id = 'a0000000-0000-4000-8000-000000000002' and role = 'admin' $q$, tests.id('company_a')), 1, 'invited admin joined');
  perform tests.throws($q$ select public.accept_invitation('invite-token-for-admin-a-0123456789abcdef') $q$, 'invitation cannot be reused', 'already used');
end $$;

-- Unverified e-mail cannot accept
do $$ begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000001');
  insert into public.company_invitations (company_id, email, role, token_hash, expires_at)
  values (tests.id('company_a'), 'late.joiner@example.com', 'viewer',
          encode(sha256(convert_to('invite-token-for-late-joiner-0123456789ab', 'UTF8')), 'hex'),
          now() + interval '7 days');
end $$;
do $$ begin
  perform tests.as_user('e0000000-0000-4000-8000-000000000001');
  perform tests.throws($q$ select public.accept_invitation('invite-token-for-late-joiner-0123456789ab') $q$, 'unverified e-mail cannot accept', 'Verify your e-mail');
end $$;

insert into public.company_members (company_id, user_id, role) values
  (tests.id('company_a'), 'a0000000-0000-4000-8000-000000000003', 'warehouse_manager'),
  (tests.id('company_a'), 'a0000000-0000-4000-8000-000000000004', 'operator'),
  (tests.id('company_a'), 'a0000000-0000-4000-8000-000000000005', 'viewer');

-- -----------------------------------------------------------------------------
-- Profiles visibility
-- -----------------------------------------------------------------------------
do $$ begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000005');
  perform tests.eq($q$ select count(*) from public.profiles $q$, 5, 'viewer A sees the 5 colleagues in company A');
  perform tests.as_user('b0000000-0000-4000-8000-000000000001');
  perform tests.eq($q$ select count(*) from public.profiles $q$, 1, 'owner B sees only own profile');
  perform tests.throws($q$ update public.profiles set email = 'x@example.com' where id = 'b0000000-0000-4000-8000-000000000001' $q$, 'profile e-mail is read-only', 'cannot be changed');
  update public.profiles set full_name = 'Owner Bravo' where id = 'a0000000-0000-4000-8000-000000000001';
  perform tests.as_postgres();
  perform tests.eq($q$ select count(*) from public.profiles where full_name = 'Owner Bravo' $q$, 0, 'cannot edit another user''s profile');
end $$;

-- -----------------------------------------------------------------------------
-- Warehouses & assignments
-- -----------------------------------------------------------------------------
do $$
declare v uuid;
begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000002');  -- admin A
  insert into public.warehouses (company_id, name, code, country_code, timezone)
  values (tests.id('company_a'), 'Rotterdam Port Hub', 'RTM1', 'NL', 'Europe/Amsterdam') returning id into v;
  perform tests.put('wh_a1', v);
  insert into public.warehouses (company_id, name, country_code, timezone)
  values (tests.id('company_a'), 'Venlo Fresh', 'NL', 'Europe/Amsterdam') returning id into v;
  perform tests.put('wh_a2', v);
  perform tests.eq(format($q$ select count(*) from public.warehouses where id = %L and created_by = 'a0000000-0000-4000-8000-000000000002' $q$, tests.id('wh_a1')), 1, 'created_by stamped');
  perform tests.throws(format($q$ insert into public.warehouses (company_id, name, country_code, timezone) values (%L, 'Bad TZ', 'NL', 'Mars/Olympus') $q$, tests.id('company_a')), 'invalid time zone rejected', 'check');
  perform tests.throws(format($q$ insert into public.warehouses (company_id, name, country_code) values (%L, 'Rotterdam Port Hub', 'NL') $q$, tests.id('company_a')), 'duplicate active warehouse name rejected', 'duplicate');

  insert into public.warehouse_assignments (company_id, warehouse_id, user_id)
  values (tests.id('company_a'), tests.id('wh_a1'), 'a0000000-0000-4000-8000-000000000003');
  perform tests.throws(format($q$ insert into public.warehouse_assignments (company_id, warehouse_id, user_id) values (%L, %L, 'a0000000-0000-4000-8000-000000000004') $q$, tests.id('company_a'), tests.id('wh_a2')), 'operators cannot be warehouse-scoped', 'Only Warehouse Managers');
end $$;

do $$
declare v uuid;
begin
  perform tests.as_user('b0000000-0000-4000-8000-000000000001');
  insert into public.warehouses (company_id, name, country_code, timezone)
  values (tests.id('company_b'), 'Hamburg Pharma', 'DE', 'Europe/Berlin') returning id into v;
  perform tests.put('wh_b1', v);
  perform tests.eq($q$ select count(*) from public.warehouses $q$, 1, 'owner B sees only own warehouse');
  perform tests.throws(format($q$ insert into public.warehouses (company_id, name, country_code) values (%L, 'Sneaky', 'NL') $q$, tests.id('company_a')), 'owner B cannot create warehouse in company A', 'row-level security');
  update public.warehouses set name = 'Hijacked' where id = tests.id('wh_a1');
  perform tests.throws(format($q$ update public.warehouses set company_id = %L where id = %L $q$, tests.id('company_a'), tests.id('wh_b1')), 'warehouse cannot move between companies');
end $$;

do $$ begin
  perform tests.eq(format($q$ select count(*) from public.warehouses where id = %L and name = 'Rotterdam Port Hub' $q$, tests.id('wh_a1')), 1, 'cross-tenant update affected nothing');
  perform tests.as_user('a0000000-0000-4000-8000-000000000003');  -- manager A
  perform tests.throws(format($q$ insert into public.warehouses (company_id, name, country_code) values (%L, 'Manager WH', 'NL') $q$, tests.id('company_a')), 'manager cannot create warehouses', 'row-level security');
  perform tests.as_user('a0000000-0000-4000-8000-000000000005');  -- viewer A
  perform tests.eq($q$ select count(*) from public.warehouses $q$, 2, 'viewer A sees both warehouses');
end $$;

-- -----------------------------------------------------------------------------
-- Zones, equipment, sensors — managers in their assigned warehouse only
-- -----------------------------------------------------------------------------
do $$
declare v uuid;
begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000003');  -- manager A (assigned to wh_a1)
  insert into public.storage_zones (company_id, warehouse_id, name, type, min_temp_c, max_temp_c, min_humidity_pct, max_humidity_pct)
  values (tests.id('company_a'), tests.id('wh_a1'), 'Freezer 1', 'freezer', -25, -18, 30, 80) returning id into v;
  perform tests.put('zone_a1', v);
  perform tests.throws(format($q$ insert into public.storage_zones (company_id, warehouse_id, name) values (%L, %L, 'Not mine') $q$, tests.id('company_a'), tests.id('wh_a2')), 'manager cannot add zone to unassigned warehouse', 'row-level security');
  perform tests.throws(format($q$ insert into public.storage_zones (company_id, warehouse_id, name, min_temp_c, max_temp_c) values (%L, %L, 'Inverted', 5, 2) $q$, tests.id('company_a'), tests.id('wh_a1')), 'min threshold must be below max', 'check');

  insert into public.equipment (company_id, warehouse_id, zone_id, name, category)
  values (tests.id('company_a'), tests.id('wh_a1'), tests.id('zone_a1'), 'Compressor C1', 'compressor') returning id into v;
  perform tests.put('equip_a1', v);

  insert into public.sensors (company_id, warehouse_id, zone_id, name, external_device_id)
  values (tests.id('company_a'), tests.id('wh_a1'), tests.id('zone_a1'), 'Probe F1-01', 'dev-0001') returning id into v;
  perform tests.put('sensor_a1', v);

  insert into public.sensor_api_keys (company_id, sensor_id, key_prefix, key_hash)
  values (tests.id('company_a'), tests.id('sensor_a1'), 'cco_live_ab12', encode(sha256('raw-device-key'::bytea), 'hex'));
  perform tests.eq($q$ select count(*) from public.sensor_api_keys $q$, 1, 'manager sees device keys of own warehouse');
  perform tests.throws(format($q$ update public.sensors set last_seen_at = now() where id = %L $q$, tests.id('sensor_a1')), 'telemetry columns are service-only', 'cannot be changed');
end $$;

do $$ begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000004');  -- operator A
  perform tests.eq($q$ select count(*) from public.sensor_api_keys $q$, 0, 'operator cannot see device keys');
  perform tests.throws(format($q$ insert into public.storage_zones (company_id, warehouse_id, name) values (%L, %L, 'Op zone') $q$, tests.id('company_a'), tests.id('wh_a1')), 'operator cannot create zones', 'row-level security');
  update public.storage_zones set max_temp_c = 10 where id = tests.id('zone_a1');
  perform tests.eq(format($q$ select count(*) from public.storage_zones where id = %L and max_temp_c = -18 $q$, tests.id('zone_a1')), 1, 'operator update of thresholds affected nothing');
end $$;

-- Composite foreign keys stop cross-company references even for the server.
do $$ begin
  perform tests.as_service();
  perform tests.throws(format($q$ insert into public.storage_zones (company_id, warehouse_id, name) values (%L, %L, 'Cross') $q$, tests.id('company_b'), tests.id('wh_a1')), 'zone cannot point at another company''s warehouse', 'foreign key');
  perform tests.throws(format($q$ insert into public.sensor_readings (company_id, warehouse_id, sensor_id, recorded_at, temperature_c) values (%L, %L, %L, now(), -20) $q$, tests.id('company_b'), tests.id('wh_b1'), tests.id('sensor_a1')), 'reading cannot claim another company''s sensor', 'foreign key');
end $$;

-- -----------------------------------------------------------------------------
-- Readings
-- -----------------------------------------------------------------------------
do $$ begin
  perform tests.as_service();
  insert into public.sensor_readings (company_id, warehouse_id, zone_id, sensor_id, recorded_at, temperature_c, humidity_pct)
  values (tests.id('company_a'), tests.id('wh_a1'), tests.id('zone_a1'), tests.id('sensor_a1'), now() - interval '10 minutes', -21.4, 55);
  insert into public.sensor_readings (company_id, warehouse_id, zone_id, sensor_id, recorded_at, temperature_c, quality)
  values (tests.id('company_a'), tests.id('wh_a1'), tests.id('zone_a1'), tests.id('sensor_a1'), now() - interval '5 minutes', 412.5, 'invalid');
  perform tests.throws(format($q$ insert into public.sensor_readings (company_id, warehouse_id, zone_id, sensor_id, recorded_at, temperature_c) values (%L, %L, %L, %L, now() - interval '1 minute', 412.5) $q$, tests.id('company_a'), tests.id('wh_a1'), tests.id('zone_a1'), tests.id('sensor_a1')), 'out-of-range value must be marked invalid', 'check');
  perform tests.throws(format($q$ insert into public.sensor_readings (company_id, warehouse_id, zone_id, sensor_id, recorded_at, temperature_c) select company_id, warehouse_id, zone_id, sensor_id, recorded_at, -20 from public.sensor_readings where sensor_id = %L limit 1 $q$, tests.id('sensor_a1')), 'duplicate reading rejected', 'duplicate');
end $$;

do $$ begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000004');  -- operator A
  insert into public.sensor_readings (company_id, warehouse_id, zone_id, sensor_id, recorded_at, temperature_c, source)
  values (tests.id('company_a'), tests.id('wh_a1'), tests.id('zone_a1'), tests.id('sensor_a1'), now(), -19.8, 'manual');
  perform tests.eq($q$ select count(*) from public.sensor_readings where source = 'manual' and recorded_by = 'a0000000-0000-4000-8000-000000000004' $q$, 1, 'manual reading stamped with operator');
  perform tests.throws(format($q$ insert into public.sensor_readings (company_id, warehouse_id, zone_id, sensor_id, recorded_at, temperature_c, source) values (%L, %L, %L, %L, now() - interval '2 minutes', -20, 'device') $q$, tests.id('company_a'), tests.id('wh_a1'), tests.id('zone_a1'), tests.id('sensor_a1')), 'people cannot write device readings', 'row-level security');
  perform tests.as_user('a0000000-0000-4000-8000-000000000005');  -- viewer A
  perform tests.throws(format($q$ insert into public.sensor_readings (company_id, warehouse_id, zone_id, sensor_id, recorded_at, temperature_c, source) values (%L, %L, %L, %L, now() - interval '3 minutes', -20, 'manual') $q$, tests.id('company_a'), tests.id('wh_a1'), tests.id('zone_a1'), tests.id('sensor_a1')), 'viewer cannot add manual readings', 'row-level security');
  perform tests.eq($q$ select count(*) from public.sensor_readings $q$, 3, 'viewer reads company readings');
  perform tests.as_user('b0000000-0000-4000-8000-000000000001');
  perform tests.eq($q$ select count(*) from public.sensor_readings $q$, 0, 'owner B reads no company A readings');
end $$;

-- -----------------------------------------------------------------------------
-- Alerts — engine raises, people handle, history is automatic
-- -----------------------------------------------------------------------------
do $$
declare v uuid;
begin
  perform tests.as_service();
  insert into public.alerts (company_id, warehouse_id, zone_id, sensor_id, type, severity, dedupe_key, title, observed_value, threshold_value)
  values (tests.id('company_a'), tests.id('wh_a1'), tests.id('zone_a1'), tests.id('sensor_a1'), 'temperature_high', 'critical',
          'zone:' || tests.id('zone_a1') || ':temperature_high', 'Freezer 1 above limit', -12.0, -18.0)
  returning id into v;
  perform tests.put('alert_a1', v);
  perform tests.throws(format($q$ insert into public.alerts (company_id, warehouse_id, type, dedupe_key, title) values (%L, %L, 'temperature_high', %L, 'dup') $q$, tests.id('company_a'), tests.id('wh_a1'), 'zone:' || tests.id('zone_a1') || ':temperature_high'), 'no duplicate open alert per zone and type', 'duplicate');
end $$;

do $$ begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000005');  -- viewer A
  update public.alerts set status = 'acknowledged' where id = tests.id('alert_a1');
  perform tests.eq(format($q$ select count(*) from public.alerts where id = %L and status = 'open' $q$, tests.id('alert_a1')), 1, 'viewer cannot acknowledge');

  perform tests.as_user('a0000000-0000-4000-8000-000000000004');  -- operator A
  perform tests.throws(format($q$ update public.alerts set severity = 'info' where id = %L $q$, tests.id('alert_a1')), 'operator cannot downgrade severity', 'cannot be changed');
  perform tests.throws(format($q$ update public.alerts set acknowledged_by = 'a0000000-0000-4000-8000-000000000001' where id = %L $q$, tests.id('alert_a1')), 'acknowledged_by cannot be forged', 'cannot be changed');
  update public.alerts set status = 'acknowledged', assigned_to = 'a0000000-0000-4000-8000-000000000003' where id = tests.id('alert_a1');
  perform tests.eq(format($q$ select count(*) from public.alerts where id = %L and acknowledged_by = 'a0000000-0000-4000-8000-000000000004' and acknowledged_at is not null $q$, tests.id('alert_a1')), 1, 'acknowledgement stamped');
  perform tests.throws(format($q$ update public.alerts set assigned_to = 'b0000000-0000-4000-8000-000000000001' where id = %L $q$, tests.id('alert_a1')), 'cannot assign to someone outside the company', 'foreign key');
  update public.alerts set status = 'resolved', resolution_notes = 'Door left open; closed and verified' where id = tests.id('alert_a1');
  perform tests.eq(format($q$ select count(*) from public.alert_events where alert_id = %L $q$, tests.id('alert_a1')), 4, 'history: created, acknowledged, assigned, resolved');
  perform tests.throws(format($q$ insert into public.alert_events (company_id, alert_id, event_type) values (%L, %L, 'resolved') $q$, tests.id('company_a'), tests.id('alert_a1')), 'alert history cannot be written by people', 'permission denied');
  perform tests.throws(format($q$ delete from public.alert_events where alert_id = %L $q$, tests.id('alert_a1')), 'alert history cannot be deleted', 'permission denied');
end $$;

-- -----------------------------------------------------------------------------
-- Incidents
-- -----------------------------------------------------------------------------
do $$
declare v uuid;
begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000004');  -- operator A
  insert into public.incidents (company_id, warehouse_id, zone_id, alert_id, title, severity)
  values (tests.id('company_a'), tests.id('wh_a1'), tests.id('zone_a1'), tests.id('alert_a1'), 'Freezer door left open', 'critical')
  returning id into v;
  perform tests.put('incident_a1', v);
  perform tests.eq(format($q$ select count(*) from public.incidents where id = %L and reported_by = 'a0000000-0000-4000-8000-000000000004' $q$, v), 1, 'reported_by stamped');
  perform tests.throws(format($q$ update public.incidents set status = 'resolved' where id = %L $q$, v), 'resolution required to resolve', 'resolution is required');
  update public.incidents set status = 'resolved', resolution = 'Door alarm added', corrective_action = 'Staff briefing' where id = v;
  insert into public.incident_updates (company_id, incident_id, body) values (tests.id('company_a'), v, 'Temperature back in range at 10:42');
  perform tests.throws(format($q$ insert into public.incident_updates (company_id, incident_id, body, to_status) values (%L, %L, 'fake', 'closed') $q$, tests.id('company_a'), v), 'status entries cannot be forged', 'row-level security');
  perform tests.eq(format($q$ select count(*) from public.incident_updates where incident_id = %L $q$, v), 3, 'timeline: reported, resolved, comment');
  perform tests.throws(format($q$ update public.incident_updates set body = 'edited' where incident_id = %L $q$, v), 'timeline is not editable', 'permission denied');

  insert into public.incident_attachments (company_id, incident_id, storage_path, file_name, mime_type, size_bytes)
  values (tests.id('company_a'), v, tests.id('company_a') || '/' || v || '/door.jpg', 'door.jpg', 'image/jpeg', 204800);
  perform tests.throws(format($q$ insert into public.incident_attachments (company_id, incident_id, storage_path, file_name, mime_type, size_bytes) values (%L, %L, 'elsewhere/x.jpg', 'x.jpg', 'image/jpeg', 100) $q$, tests.id('company_a'), v), 'attachment path must be inside company/incident folder', 'check');
  perform tests.throws(format($q$ insert into public.incident_attachments (company_id, incident_id, storage_path, file_name, mime_type, size_bytes) values (%L, %L, %L, 'big.pdf', 'application/pdf', 20000000) $q$, tests.id('company_a'), v, tests.id('company_a') || '/' || v || '/big.pdf'), 'attachment size capped at 10 MB', 'check');
end $$;

-- -----------------------------------------------------------------------------
-- Maintenance
-- -----------------------------------------------------------------------------
do $$
declare v uuid;
begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000003');  -- manager A
  insert into public.maintenance_tasks (company_id, warehouse_id, equipment_id, title, due_at, assigned_to)
  values (tests.id('company_a'), tests.id('wh_a1'), tests.id('equip_a1'), 'Quarterly compressor service', now() + interval '3 days', 'a0000000-0000-4000-8000-000000000004')
  returning id into v;
  perform tests.put('task_a1', v);

  perform tests.as_user('a0000000-0000-4000-8000-000000000004');  -- operator A
  perform tests.throws(format($q$ update public.maintenance_tasks set due_at = now() + interval '30 days' where id = %L $q$, v), 'operator cannot move due date', 'Only status and notes');
  update public.maintenance_tasks set status = 'completed', notes = 'Filters replaced' where id = v;
  perform tests.eq(format($q$ select count(*) from public.maintenance_tasks where id = %L and completed_by = 'a0000000-0000-4000-8000-000000000004' and completed_at is not null $q$, v), 1, 'completion stamped');

  perform tests.as_user('a0000000-0000-4000-8000-000000000005');  -- viewer A
  perform tests.throws(format($q$ insert into public.inspections (company_id, warehouse_id, equipment_id, result) values (%L, %L, %L, 'pass') $q$, tests.id('company_a'), tests.id('wh_a1'), tests.id('equip_a1')), 'viewer cannot record inspections', 'row-level security');
end $$;

-- -----------------------------------------------------------------------------
-- Roles & ownership
-- -----------------------------------------------------------------------------
do $$ begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000002');  -- admin A
  update public.company_members set role = 'viewer' where user_id = 'a0000000-0000-4000-8000-000000000001' and company_id = tests.id('company_a');
  perform tests.eq(format($q$ select count(*) from public.company_members where company_id = %L and role = 'owner' and user_id = 'a0000000-0000-4000-8000-000000000001' $q$, tests.id('company_a')), 1, 'admin cannot demote the owner');
  perform tests.throws(format($q$ update public.company_members set role = 'owner' where user_id = 'a0000000-0000-4000-8000-000000000005' and company_id = %L $q$, tests.id('company_a')), 'admin cannot create a second owner', 'row-level security');
  delete from public.company_members where user_id = 'a0000000-0000-4000-8000-000000000001';
  perform tests.eq(format($q$ select count(*) from public.company_members where company_id = %L $q$, tests.id('company_a')), 5, 'admin cannot remove the owner');
  perform tests.throws($q$ select public.transfer_ownership((select id from public.companies limit 1), 'a0000000-0000-4000-8000-000000000002') $q$, 'admin cannot transfer ownership', 'Only the owner');

  perform tests.as_user('a0000000-0000-4000-8000-000000000001');  -- owner A
  perform tests.throws(format($q$ update public.companies set status = 'active' where id = %L $q$, tests.id('company_a')), 'owner cannot self-activate subscription', 'billing');
  update public.companies set critical_temp_excursion_c = 3.0 where id = tests.id('company_a');
  perform tests.throws(format($q$ select public.transfer_ownership(%L, 'b0000000-0000-4000-8000-000000000001') $q$, tests.id('company_a')), 'cannot transfer to a non-member', 'must already be a member');
  perform public.transfer_ownership(tests.id('company_a'), 'a0000000-0000-4000-8000-000000000002');
  perform tests.eq(format($q$ select count(*) from public.company_members where company_id = %L and role = 'owner' and user_id = 'a0000000-0000-4000-8000-000000000002' $q$, tests.id('company_a')), 1, 'ownership transferred');
  perform tests.eq(format($q$ select count(*) from public.company_members where company_id = %L and role = 'admin' and user_id = 'a0000000-0000-4000-8000-000000000001' $q$, tests.id('company_a')), 1, 'previous owner is now admin');
end $$;

do $$ begin
  perform tests.as_user('d0000000-0000-4000-8000-000000000001');  -- platform admin
  perform tests.eq($q$ select count(*) from public.companies $q$, 2, 'platform admin sees all companies');
  update public.companies set status = 'active' where id = tests.id('company_b');
  perform tests.eq(format($q$ select count(*) from public.companies where id = %L and status = 'active' $q$, tests.id('company_b')), 1, 'platform admin can change subscription status');
  perform tests.as_user('a0000000-0000-4000-8000-000000000001');
  perform tests.eq($q$ select count(*) from public.platform_admins $q$, 0, 'regular users cannot list platform admins');
  perform tests.throws($q$ insert into public.platform_admins (user_id) values ('a0000000-0000-4000-8000-000000000001') $q$, 'users cannot make themselves platform admin', 'row-level security');
end $$;

-- -----------------------------------------------------------------------------
-- Audit trail
-- -----------------------------------------------------------------------------
do $$ begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000002');  -- now owner A
  perform tests.eq($q$ select count(*) from public.audit_logs where action = 'warehouses.created' $q$, 2, 'owner sees warehouse creation in audit log');
  perform tests.eq($q$ select count(*) from public.audit_logs where action = 'alerts.updated' and actor_id = 'a0000000-0000-4000-8000-000000000004' and metadata -> 'changes' ? 'status' $q$, 2, 'alert status changes audited with actor');
  perform tests.eq($q$ select count(*) from public.audit_logs where ip = '203.0.113.7' $q$, (select count(*) from public.audit_logs where ip is not null), 'client IP captured from x-forwarded-for');
  perform tests.eq($q$ select count(*) from public.audit_logs where metadata::text like '%key_hash%' or metadata::text like '%token_hash%' $q$, 0, 'secrets never copied into the audit log');
  perform tests.eq($q$ select count(*) from public.audit_logs where company_id <> (select id from public.companies where name like 'Alpha%') $q$, 0, 'owner A sees no other company''s logs');
  perform tests.throws($q$ insert into public.audit_logs (action, resource_type) values ('fake.event', 'x') $q$, 'users cannot write audit logs', 'permission denied');

  perform tests.as_user('a0000000-0000-4000-8000-000000000004');  -- operator A
  perform tests.eq($q$ select count(*) from public.audit_logs $q$, 0, 'operators cannot read the audit log');
end $$;

do $$ begin
  perform tests.as_service();
  update public.sensors set last_seen_at = now(), battery_pct = 87.5, signal_rssi = -71;
  perform tests.as_postgres();
  perform tests.eq($q$ select count(*) from public.audit_logs where action = 'sensors.updated' $q$, 0, 'telemetry-only sensor changes are not audited');
  perform tests.throws($q$ update public.audit_logs set action = 'tampered' $q$, 'audit log rejects UPDATE even for the database owner', 'insert-only');
  perform tests.throws($q$ delete from public.audit_logs $q$, 'audit log rejects DELETE even for the database owner', 'insert-only');
end $$;

-- -----------------------------------------------------------------------------
-- Anonymous access
-- -----------------------------------------------------------------------------
do $$ begin
  perform tests.as_anon();
  perform tests.eq($q$ select count(*) from public.subscription_plans $q$, 3, 'anon reads the public price list');
  perform tests.throws($q$ select count(*) from public.companies $q$, 'anon cannot read companies', 'permission denied');
  perform tests.throws($q$ select count(*) from public.sensor_readings $q$, 'anon cannot read readings', 'permission denied');
  perform tests.throws($q$ select public.check_rate_limit('x', 1, 60) $q$, 'anon cannot call the rate limiter', 'permission denied');
end $$;

-- -----------------------------------------------------------------------------
-- Rate limiting
-- -----------------------------------------------------------------------------
do $$ begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000001');
  perform tests.throws($q$ select public.check_rate_limit('login:1.2.3.4', 2, 60) $q$, 'users cannot call the rate limiter', 'permission denied');
  perform tests.as_service();
  perform tests.eq($q$ select public.check_rate_limit('login:1.2.3.4', 2, 60)::int $q$, 1, 'rate limit: 1st call allowed');
  perform tests.eq($q$ select public.check_rate_limit('login:1.2.3.4', 2, 60)::int $q$, 1, 'rate limit: 2nd call allowed');
  perform tests.eq($q$ select public.check_rate_limit('login:1.2.3.4', 2, 60)::int $q$, 0, 'rate limit: 3rd call blocked');
end $$;

-- -----------------------------------------------------------------------------
-- Storage policies
-- -----------------------------------------------------------------------------
do $$ begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000004');  -- operator A
  insert into storage.objects (bucket_id, name, owner_id)
  values ('incident-attachments', tests.id('company_a') || '/' || tests.id('incident_a1') || '/door.jpg', 'a0000000-0000-4000-8000-000000000004');
  perform tests.throws(format($q$ insert into storage.objects (bucket_id, name) values ('incident-attachments', %L) $q$, tests.id('company_a') || '/' || gen_random_uuid() || '/x.jpg'), 'upload requires an existing incident', 'row-level security');

  perform tests.as_user('a0000000-0000-4000-8000-000000000005');  -- viewer A
  perform tests.eq($q$ select count(*) from storage.objects $q$, 1, 'viewer can read company files');
  perform tests.throws(format($q$ insert into storage.objects (bucket_id, name) values ('incident-attachments', %L) $q$, tests.id('company_a') || '/' || tests.id('incident_a1') || '/v.jpg'), 'viewer cannot upload', 'row-level security');

  perform tests.as_user('b0000000-0000-4000-8000-000000000001');  -- owner B
  perform tests.eq($q$ select count(*) from storage.objects $q$, 0, 'owner B cannot read company A files');
  perform tests.throws(format($q$ insert into storage.objects (bucket_id, name) values ('incident-attachments', %L) $q$, tests.id('company_a') || '/' || tests.id('incident_a1') || '/b.jpg'), 'owner B cannot upload into company A', 'row-level security');
end $$;

-- -----------------------------------------------------------------------------
-- Notifications are private to each user
-- -----------------------------------------------------------------------------
do $$ begin
  perform tests.as_service();
  insert into public.notifications (company_id, user_id, type, title, link)
  values (tests.id('company_a'), 'a0000000-0000-4000-8000-000000000004', 'alert.created', 'Freezer 1 above limit', '/app/alerts');
  perform tests.as_user('a0000000-0000-4000-8000-000000000005');
  perform tests.eq($q$ select count(*) from public.notifications $q$, 0, 'users cannot see others'' notifications');
  perform tests.as_user('a0000000-0000-4000-8000-000000000004');
  update public.notifications set read_at = now();
  perform tests.eq($q$ select count(*) from public.notifications where read_at is not null $q$, 1, 'user marks own notification read');
  perform tests.throws($q$ update public.notifications set title = 'changed' $q$, 'notification content is read-only', 'cannot be changed');
end $$;

-- -----------------------------------------------------------------------------
-- Company deletion cascades and leaves one audit record
-- -----------------------------------------------------------------------------
do $$ begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000001');  -- admin A now (not owner)
  delete from public.companies where id = tests.id('company_a');
  perform tests.eq(format($q$ select count(*) from public.companies where id = %L $q$, tests.id('company_a')), 1, 'only the owner can delete a company');

  perform tests.as_user('b0000000-0000-4000-8000-000000000001');  -- owner B
  delete from public.companies where id = tests.id('company_b');
  perform tests.as_postgres();
  perform tests.eq(format($q$ select count(*) from public.warehouses where company_id = %L $q$, tests.id('company_b')), 0, 'company deletion cascades');
  perform tests.eq(format($q$ select count(*) from public.audit_logs where action = 'companies.deleted' and resource_id = %L and company_id is null $q$, tests.id('company_b')), 1, 'company deletion recorded once');
end $$;

\echo 'All tenancy and RLS tests passed.'
