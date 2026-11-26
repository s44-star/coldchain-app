-- =============================================================================
-- Readings retention, housekeeping and secret redaction in the audit log.
-- =============================================================================

do $$
declare
  v_hour timestamptz := date_trunc('hour', now() - interval '25 months');
  v jsonb;
begin
  perform tests.as_service();
  insert into public.sensor_readings (company_id, warehouse_id, zone_id, sensor_id, recorded_at, temperature_c, humidity_pct, quality)
  values
    (tests.id('company_a'), tests.id('wh_a1'), tests.id('zone_a1'), tests.id('sensor_a1'), v_hour + interval '1 minute', -20, 50, 'ok'),
    (tests.id('company_a'), tests.id('wh_a1'), tests.id('zone_a1'), tests.id('sensor_a1'), v_hour + interval '2 minutes', -22, 60, 'ok'),
    (tests.id('company_a'), tests.id('wh_a1'), tests.id('zone_a1'), tests.id('sensor_a1'), v_hour + interval '3 minutes', -18, null, 'suspect'),
    (tests.id('company_a'), tests.id('wh_a1'), tests.id('zone_a1'), tests.id('sensor_a1'), v_hour + interval '4 minutes', -80, null, 'invalid'),
    (tests.id('company_a'), tests.id('wh_a1'), tests.id('zone_a1'), tests.id('sensor_a1'), now() - interval '23 months', -19, null, 'ok');

  v := public.run_housekeeping();
  perform tests.eq(format('select %s', v ->> 'readings_rolled_up'), 4, 'readings past retention are moved');
  perform tests.eq(format($q$ select count(*) from public.sensor_readings where sensor_id = %L and recorded_at < now() - interval '24 months' $q$, tests.id('sensor_a1')), 0, 'raw readings past retention are gone');
  perform tests.eq(format($q$ select count(*) from public.sensor_readings where sensor_id = %L and recorded_at < now() - interval '22 months' $q$, tests.id('sensor_a1')), 1, 'readings inside retention are kept');
  perform tests.eq(format($q$
    select count(*) from public.sensor_readings_hourly
    where sensor_id = %L and hour = %L and readings = 3 and temp_min = -22 and temp_max = -18
      and temp_n = 3 and temp_sum = -60 and hum_n = 2 and hum_min = 50 and hum_max = 60 and zone_id = %L
  $q$, tests.id('sensor_a1'), v_hour, tests.id('zone_a1')), 1, 'hourly summary excludes invalid readings');

  -- A late batch for the same hour merges into the summary.
  insert into public.sensor_readings (company_id, warehouse_id, zone_id, sensor_id, recorded_at, temperature_c)
  values (tests.id('company_a'), tests.id('wh_a1'), tests.id('zone_a1'), tests.id('sensor_a1'), v_hour + interval '30 minutes', -30);
  v := public.run_housekeeping();
  perform tests.eq(format('select %s', v ->> 'readings_rolled_up'), 1, 'second run moves only new rows');
  perform tests.eq(format($q$ select count(*) from public.sensor_readings_hourly where sensor_id = %L and hour = %L and readings = 4 and temp_min = -30 and temp_n = 4 $q$, tests.id('sensor_a1'), v_hour), 1, 'summaries merge');
  v := public.run_housekeeping();
  perform tests.eq(format('select %s', v ->> 'readings_rolled_up'), 0, 'nothing left to move');

  -- Retention below 3 months is ignored.
  insert into public.sensor_readings (company_id, warehouse_id, zone_id, sensor_id, recorded_at, temperature_c)
  values (tests.id('company_a'), tests.id('wh_a1'), tests.id('zone_a1'), tests.id('sensor_a1'), now() - interval '2 months', -19);
  update public.app_settings set value = '1' where key = 'reading_retention_months';
  v := public.run_housekeeping();
  perform tests.eq(format($q$ select count(*) from public.sensor_readings where sensor_id = %L and recorded_at < now() - interval '1 month' and recorded_at > now() - interval '3 months' $q$, tests.id('sensor_a1')), 1, 'retention never shorter than 3 months');
  update public.app_settings set value = '24' where key = 'reading_retention_months';
end $$;

do $$ begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000005');  -- viewer A
  perform tests.eq('select count(*) from public.sensor_readings_hourly', 2, 'members read their summaries');
  perform tests.throws('select public.run_housekeeping()', 'users cannot run housekeeping', 'permission denied');
  perform tests.throws(format($q$ delete from public.sensor_readings_hourly where sensor_id = %L $q$, tests.id('sensor_a1')), 'summaries are read-only for users', 'permission denied');
  perform tests.as_user('b0000000-0000-4000-8000-000000000001');
  perform tests.eq('select count(*) from public.sensor_readings_hourly', 0, 'other companies see nothing');
end $$;

do $$ begin
  perform tests.as_postgres();
  insert into public.app_settings (key, value) values ('test_api_key', to_jsonb('very-secret-value'::text));
  update public.app_settings set value = to_jsonb('another-secret'::text) where key = 'test_api_key';
  perform tests.eq($q$ select count(*) from public.audit_logs where resource_id = 'test_api_key' $q$, 2, 'secret setting changes are still logged');
  perform tests.eq($q$ select count(*) from public.audit_logs where metadata::text like '%secret-value%' or metadata::text like '%another-secret%' $q$, 0, 'secret values never reach the audit log');
  update public.app_settings set value = '15' where key = 'trial_days';
  perform tests.eq($q$ select count(*) from public.audit_logs where resource_id = 'trial_days' and metadata -> 'changes' -> 'value' ->> 'to' = '15' $q$, 1, 'ordinary settings keep their values in the log');
  update public.app_settings set value = '14' where key = 'trial_days';
  delete from public.app_settings where key = 'test_api_key';
end $$;

\echo 'All housekeeping tests passed.'
