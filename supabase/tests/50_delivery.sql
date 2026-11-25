-- =============================================================================
-- Alert e-mail queue and alert wording.
-- =============================================================================

do $$
declare v jsonb;
begin
  perform tests.as_service();
  update public.alerts set status = 'resolved', resolution_notes = 'reset' where status <> 'resolved';
  delete from public.notification_deliveries;
  update public.profiles set email_alerts = false where id = 'a0000000-0000-4000-8000-000000000004';  -- operator opts out

  v := public.ingest_readings(tests.id('sensor_a1'), jsonb_build_array(
    jsonb_build_object('recorded_at', now() + interval '3 minutes', 'temperature_c', -10.0)));

  perform tests.eq($q$ select count(*) from public.alerts where status = 'open' and title = 'Freezer 1 above -18 °C' $q$, 1, 'alert title has no trailing zeros');
  perform tests.eq($q$ select count(*) from public.alerts where status = 'open' and message like '-10 °C recorded at % UTC; limit is -18 °C.' $q$, 1, 'alert message has no trailing zeros');
  perform tests.eq($q$ select count(*) from public.notification_deliveries where status = 'pending' and channel = 'email' $q$, 3, 'e-mails queued for non-viewers who did not opt out');
  perform tests.eq($q$ select count(*) from public.notification_deliveries where recipient = 'operator.a@example.com' $q$, 0, 'opted-out member gets no e-mail');
  perform tests.eq($q$ select count(*) from public.notification_deliveries where subject like '[Critical] %' $q$, 3, 'subject carries the severity');

  perform tests.eq('select count(*) from public.claim_deliveries(2)', 2, 'worker claims a batch');
  perform tests.eq('select count(*) from public.claim_deliveries(10)', 1, 'claimed rows are leased, not claimed twice');
  perform tests.eq($q$ select count(*) from public.notification_deliveries where attempts = 1 $q$, 3, 'attempts counted');
end $$;

do $$ begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000002');
  perform tests.throws('select public.claim_deliveries(1)', 'users cannot claim deliveries', 'permission denied');
  perform tests.eq($q$ select count(*) from public.notification_deliveries $q$, 3, 'owner sees the delivery log');
  perform tests.as_user('a0000000-0000-4000-8000-000000000005');
  perform tests.eq($q$ select count(*) from public.notification_deliveries $q$, 0, 'viewers do not see the delivery log');
end $$;

\echo 'All delivery tests passed.'
