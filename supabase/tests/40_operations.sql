-- =============================================================================
-- Maintenance automation, overdue sweep, plan limits.
-- =============================================================================

do $$
declare v uuid;
begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000003');  -- manager of wh_a1
  insert into public.maintenance_schedules (company_id, warehouse_id, equipment_id, title, interval_days, next_due_at)
  values (tests.id('company_a'), tests.id('wh_a1'), tests.id('equip_a1'), 'Monthly condenser clean', 30, now() - interval '1 day')
  returning id into v;
  perform tests.put('schedule_a1', v);
  perform tests.eq(format($q$ select count(*) from public.maintenance_tasks where schedule_id = %L and status = 'pending' $q$, v), 1, 'schedule creates its first task');
end $$;

do $$ begin
  perform tests.as_service();
  perform tests.eq('select public.sweep_maintenance()', 1, 'overdue task raises an alert');
  perform tests.eq('select public.sweep_maintenance()', 0, 'overdue alert is raised once');
  perform tests.eq($q$ select count(*) from public.alerts where type = 'maintenance_overdue' and status = 'open' $q$, 1, 'maintenance alert open');
  perform tests.eq($q$ select (public.run_sweeps() ? 'maintenance')::int $q$, 1, 'run_sweeps runs both sweeps');
end $$;

do $$ begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000004');  -- operator completes it
  update public.maintenance_tasks set status = 'completed', notes = 'Cleaned, fins straightened'
  where schedule_id = tests.id('schedule_a1') and status = 'pending';
  perform tests.eq(format($q$ select count(*) from public.maintenance_tasks where schedule_id = %L and status = 'pending' and due_at > now() + interval '29 days' $q$, tests.id('schedule_a1')), 1, 'next task created 30 days out');
  perform tests.eq(format($q$ select count(*) from public.maintenance_schedules where id = %L and next_due_at > now() + interval '29 days' $q$, tests.id('schedule_a1')), 1, 'schedule moved forward');
  perform tests.eq($q$ select count(*) from public.alerts where type = 'maintenance_overdue' and status = 'open' $q$, 0, 'overdue alert settled by completion');
end $$;

-- Plan limits: a paid Starter company may have one warehouse
do $$
declare v uuid; v_plan uuid;
begin
  perform tests.create_user('aa000000-0000-4000-8000-000000000001', 'starter.owner@example.com');
  perform tests.as_user('aa000000-0000-4000-8000-000000000001');
  v := public.create_company('Delta Dairy', 'IE');
  perform tests.put('company_d', v);

  perform tests.as_service();
  select id into v_plan from public.subscription_plans where code = 'starter';
  insert into public.customer_subscriptions (company_id, plan_id, billing_interval, status, current_period_start, current_period_end)
  values (v, v_plan, 'monthly', 'active', now(), now() + interval '1 month');

  perform tests.as_user('aa000000-0000-4000-8000-000000000001');
  insert into public.warehouses (company_id, name, country_code) values (v, 'Cork', 'IE');
  perform tests.throws(format($q$ insert into public.warehouses (company_id, name, country_code) values (%L, 'Dublin', 'IE') $q$, v), 'second warehouse blocked on Starter', 'Plan limit reached');
  perform tests.eq(format($q$ select warehouses * 10 + max_warehouses from public.company_usage(%L) where plan_name = 'Starter' $q$, v), 11, 'usage shows 1 of 1 warehouses on Starter');

  perform tests.as_service();
  insert into public.warehouses (company_id, name, country_code) values (v, 'Dublin (server)', 'IE');
  perform tests.eq(format($q$ select count(*) from public.warehouses where company_id = %L $q$, v), 2, 'server jobs are not limited');
end $$;

do $$ begin
  perform tests.as_user('a0000000-0000-4000-8000-000000000001');  -- admin of company A (trial)
  perform tests.eq(format($q$ select count(*) from public.company_usage(%L) where plan_name = 'Professional' and max_warehouses = 5 $q$, tests.id('company_a')), 1, 'trials get Professional limits');
  perform tests.throws(format($q$ select * from public.company_usage(%L) $q$, tests.id('company_d')), 'usage is private to members', 'Not a member');
end $$;

\echo 'All operations tests passed.'
