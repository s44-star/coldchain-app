-- Test helpers: impersonate API roles the way PostgREST does, and assert errors.

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create function tests.create_user(p_id uuid, p_email text, p_confirmed boolean default true)
returns uuid
language sql
as $$
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values (p_id, p_email, case when p_confirmed then now() end, jsonb_build_object('full_name', split_part(p_email, '@', 1)))
  returning id;
$$;

-- Become an authenticated user for the rest of the current transaction.
create function tests.as_user(p_id uuid)
returns void
language plpgsql
as $$
declare
  v_email text;
begin
  perform set_config('role', 'postgres', true);
  select email into v_email from auth.users where id = p_id;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_id, 'role', 'authenticated', 'email', v_email)::text,
    true
  );
  perform set_config(
    'request.headers',
    '{"x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "rls-test"}',
    true
  );
  perform set_config('role', 'authenticated', true);
end;
$$;

create function tests.as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

create function tests.as_service()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  perform set_config('role', 'service_role', true);
end;
$$;

create function tests.as_postgres()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Run p_sql and require it to fail. Optionally require a message fragment.
create function tests.throws(p_sql text, p_label text, p_message_like text default null)
returns void
language plpgsql
as $$
declare
  v_message text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_message = message_text;
    if p_message_like is not null and v_message not ilike '%' || p_message_like || '%' then
      raise exception 'FAIL [%]: failed with unexpected error: %', p_label, v_message;
    end if;
    raise notice 'ok   %', p_label;
    return;
  end;
  raise exception 'FAIL [%]: statement succeeded but should have failed', p_label;
end;
$$;

-- Require p_sql (a statement returning one integer) to equal p_expected.
create function tests.eq(p_sql text, p_expected bigint, p_label text)
returns void
language plpgsql
as $$
declare
  v_actual bigint;
begin
  execute p_sql into v_actual;
  if v_actual is distinct from p_expected then
    raise exception 'FAIL [%]: expected %, got %', p_label, p_expected, v_actual;
  end if;
  raise notice 'ok   %', p_label;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
