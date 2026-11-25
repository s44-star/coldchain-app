#!/usr/bin/env bash
# Applies every migration to a throw-away Postgres database (with a stand-in
# for Supabase's auth/storage schemas) and runs the RLS test suite.
#
# Uses the standard libpq variables: PGHOST, PGPORT, PGUSER, PGPASSWORD.
# The connecting user must be a superuser (as `postgres` is locally and in CI).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${TEST_DB:-coldchain_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 --no-psqlrc)

echo "▸ Creating database ${DB}"
"${PSQL[@]}" -d postgres -c "drop database if exists ${DB} with (force);" >/dev/null
"${PSQL[@]}" -d postgres -c "create database ${DB};" >/dev/null

run() {
  echo "▸ $(basename "$1")"
  "${PSQL[@]}" -d "${DB}" -f "$1"
}

run "${ROOT}/supabase/tests/00_supabase_stub.sql"
for f in "${ROOT}"/supabase/migrations/*.sql; do run "$f"; done
run "${ROOT}/supabase/seed/plans.sql"
# Seeds must be idempotent
run "${ROOT}/supabase/seed/plans.sql"
run "${ROOT}/supabase/tests/01_helpers.sql"

echo "▸ Static checks: RLS on every table, policies present, definer functions pinned"
"${PSQL[@]}" -d "${DB}" -t -A -c "
  do \$\$
  declare bad text;
  begin
    select string_agg(c.relname, ', ') into bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
    if bad is not null then raise exception 'Tables without RLS: %', bad; end if;

    -- rate_limits is intentionally policy-less (reachable only via RPC)
    select string_agg(c.relname, ', ') into bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'rate_limits'
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid);
    if bad is not null then raise exception 'Tables without any policy: %', bad; end if;

    select string_agg(n.nspname || '.' || p.proname, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%');
    if bad is not null then raise exception 'SECURITY DEFINER functions without search_path: %', bad; end if;

    select string_agg(c.relname, ', ') into bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege('anon', c.oid, 'select') and c.relname <> 'subscription_plans';
    if bad is not null then raise exception 'Tables readable by anon: %', bad; end if;
  end \$\$;"

for f in "${ROOT}"/supabase/tests/[1-9][0-9]_*.sql; do
  echo "▸ $(basename "$f")"
  "${PSQL[@]}" -d "${DB}" -f "$f" 2>&1 | sed -e 's/^psql:[^ ]* NOTICE:  /  /'
done

echo "✓ Database tests passed"
