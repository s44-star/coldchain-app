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
