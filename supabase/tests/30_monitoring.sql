-- =============================================================================
-- Monitoring: ingestion, alert engine, offline sweep, simulated data.
-- Uses company A, zone "Freezer 1" (−25 to −18 °C) and sensor dev-0001.
-- =============================================================================

do $$
declare v jsonb;
begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000004');
  perform tests.throws(format($q$ select public.ingest_readings(%L, '[]'::jsonb) $q$, tests.id('sensor_a1')), 'people cannot call the ingestion function directly', 'permission denied');

  perform tests.as_service();
  delete from public.notifications;

  v := public.ingest_readings(tests.id('sensor_a1'), jsonb_build_array(
    jsonb_build_object('recorded_at', now() - interval '20 minutes', 'temperature_c', -21.0, 'humidity_pct', 50),
    jsonb_build_object('recorded_at', now() - interval '15 minutes', 'temperature_c', -20.5),
    jsonb_build_object('recorded_at', now() + interval '1 hour', 'temperature_c', -20.0),
    jsonb_build_object('recorded_at', 'not a date', 'temperature_c', -20.0),
    jsonb_build_object('recorded_at', now() - interval '14 minutes')
  ));
  perform tests.eq(format('select %s', v ->> 'accepted'), 2, 'in-range readings accepted');
  perform tests.eq(format('select %s', v ->> 'rejected'), 3, 'future, malformed and empty readings rejected');
  perform tests.eq(format('select %s', v ->> 'alerts'), 0, 'no alert within limits');
  perform tests.eq(format($q$ select count(*) from public.sensors where id = %L and status = 'active' and last_reading_at is not null $q$, tests.id('sensor_a1')), 1, 'sensor marked reporting');

  v := public.ingest_readings(tests.id('sensor_a1'), jsonb_build_array(
    jsonb_build_object('recorded_at', now() - interval '15 minutes', 'temperature_c', -20.5)
  ));
  perform tests.eq(format('select %s', v ->> 'duplicates'), 1, 'repeated reading counted as duplicate');

  -- 1 °C over the limit: warning
  v := public.ingest_readings(tests.id('sensor_a1'), jsonb_build_array(
    jsonb_build_object('recorded_at', now() - interval '10 minutes', 'temperature_c', -17.0)));
  perform tests.eq(format($q$ select count(*) from public.alerts where zone_id = %L and type = 'temperature_high' and status = 'open' and severity = 'warning' $q$, tests.id('zone_a1')), 1, 'excursion opens a warning alert');

  -- 5 °C over (company critical threshold is 3 °C): same alert, escalated
  v := public.ingest_readings(tests.id('sensor_a1'), jsonb_build_array(
    jsonb_build_object('recorded_at', now() - interval '5 minutes', 'temperature_c', -13.0)));
  perform tests.eq(format($q$ select count(*) from public.alerts where zone_id = %L and type = 'temperature_high' and status = 'open' $q$, tests.id('zone_a1')), 1, 'repeat excursion does not open a second alert');
  perform tests.eq(format($q$ select count(*) from public.alerts where zone_id = %L and status = 'open' and severity = 'critical' and trigger_count = 2 and observed_value = -13 $q$, tests.id('zone_a1')), 1, 'alert escalated to critical and counted twice');
  perform tests.eq($q$ select count(*) from public.notifications where type = 'alert.created' $q$, 4, 'new alert notifies the 4 non-viewer members once');

  -- Physically impossible values are stored as invalid and never alert
  v := public.ingest_readings(tests.id('sensor_a1'), jsonb_build_array(
    jsonb_build_object('recorded_at', now() - interval '4 minutes', 'temperature_c', 300)));
  perform tests.eq($q$ select count(*) from public.sensor_readings where temperature_c = 300 and quality = 'invalid' $q$, 1, 'impossible value kept as invalid');
  perform tests.eq(format('select %s', v ->> 'alerts'), 0, 'invalid value raises no alert');

  perform tests.throws(format($q$ select public.ingest_readings(%L, '{"a":1}'::jsonb) $q$, tests.id('sensor_a1')), 'payload must be an array', 'array');
end $$;

-- Offline sweep
do $$
declare v integer;
begin
  perform tests.as_service();
  update public.sensors set last_reading_at = now() - interval '2 hours' where id = tests.id('sensor_a1');
  v := public.sweep_sensors();
  perform tests.eq(format('select %s', v), 1, 'silent sensor detected');
  perform tests.eq(format($q$ select count(*) from public.sensors where id = %L and status = 'offline' $q$, tests.id('sensor_a1')), 1, 'sensor marked offline');
  perform tests.eq(format($q$ select count(*) from public.alerts where sensor_id = %L and type = 'sensor_offline' and status = 'open' $q$, tests.id('sensor_a1')), 1, 'offline alert raised');
  perform tests.eq('select public.sweep_sensors()', 0, 'sweep does not repeat for an offline sensor');

  perform public.ingest_readings(tests.id('sensor_a1'), jsonb_build_array(
    jsonb_build_object('recorded_at', now() - interval '1 minute', 'temperature_c', -20.0)));
  perform tests.eq(format($q$ select count(*) from public.sensors where id = %L and status = 'active' $q$, tests.id('sensor_a1')), 1, 'sensor back to reporting on its next reading');
end $$;

-- Simulated data
do $$
declare v jsonb;
begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000004');  -- operator
  perform tests.throws(format($q$ select public.simulate_readings(%L, 2) $q$, tests.id('sensor_a1')), 'operators cannot generate simulated data', 'Only managers');

  perform tests.as_user('a0000000-0000-4000-8000-000000000003');  -- manager of wh_a1
  update public.alerts set status = 'resolved', resolution_notes = 'test' where status <> 'resolved' and zone_id = tests.id('zone_a1');
  v := public.simulate_readings(tests.id('sensor_a1'), 2, true);
  perform tests.eq(format('select %s', v ->> 'accepted'), 25, '2 hours of 5-minute readings plus one excursion');
  perform tests.eq($q$ select count(*) from public.sensor_readings where source = 'simulated' and quality = 'ok' $q$, 25, 'simulated readings are labelled as simulated');
  perform tests.eq($q$ select count(*) from public.alerts where status = 'open' and type = 'temperature_high' and title like 'Simulated: %' $q$, 1, 'alerts from simulated data say so');
  perform tests.throws(format($q$ select public.simulate_readings(%L, 100) $q$, tests.id('sensor_a1')), 'simulation window is capped', 'between 1 and 48');
end $$;

-- Manual readings are checked too
do $$ begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000004');  -- operator
  update public.alerts set status = 'resolved', resolution_notes = 'test' where status <> 'resolved';
  insert into public.sensor_readings (company_id, warehouse_id, zone_id, sensor_id, recorded_at, temperature_c, source)
  values (tests.id('company_a'), tests.id('wh_a1'), tests.id('zone_a1'), tests.id('sensor_a1'), now() + interval '2 minutes', -26.5, 'manual');
  perform tests.eq($q$ select count(*) from public.alerts where status = 'open' and type = 'temperature_low' and title not like 'Simulated%' $q$, 1, 'manual reading below the limit opens an alert');
end $$;

\echo 'All monitoring tests passed.'

