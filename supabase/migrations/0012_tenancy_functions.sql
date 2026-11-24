-- =============================================================================
-- ColdChain OS · 0012_tenancy_functions
-- RPCs that change tenancy atomically. Each validates the caller itself;
-- they are SECURITY DEFINER because they write rows the caller cannot
-- write directly (owner membership, accepted invitations).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_company — new tenant + the caller as Owner, trial started
-- -----------------------------------------------------------------------------
create or replace function public.create_company(
  p_name                text,
  p_country_code        text,
  p_vat_number          text default null,
  p_registration_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_trial_days integer;
  v_company_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  -- Abuse guard: at most 3 companies created per user per day.
  if (
    select count(*) from public.companies
    where created_by = v_uid and created_at > now() - interval '1 day'
  ) >= 3 then
    raise exception 'Too many companies created today' using errcode = '54000';
  end if;

  select coalesce((value #>> '{}')::integer, 14) into v_trial_days
  from public.app_settings where key = 'trial_days';

  insert into public.companies (name, country_code, vat_number, registration_number, status, trial_ends_at, created_by)
  values (
    trim(p_name),
    upper(trim(p_country_code)),
    nullif(trim(p_vat_number), ''),
    nullif(trim(p_registration_number), ''),
    'trial',
    now() + make_interval(days => coalesce(v_trial_days, 14)),
    v_uid
  )
  returning id into v_company_id;

  insert into public.company_members (company_id, user_id, role)
  values (v_company_id, v_uid, 'owner');

  return v_company_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- get_invitation — preview for the /invite/[token] page (works signed out)
-- -----------------------------------------------------------------------------
create or replace function public.get_invitation(p_token text)
returns table (
  company_name text,
  email        text,
  role         public.member_role,
  expires_at   timestamptz,
  state        text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.name,
    i.email,
    i.role,
    i.expires_at,
    case
      when i.revoked_at is not null then 'revoked'
      when i.accepted_at is not null then 'accepted'
      when i.expires_at <= now() then 'expired'
      else 'pending'
    end
  from public.company_invitations i
  join public.companies c on c.id = i.company_id
  where p_token is not null
    and length(p_token) between 32 and 256
    and i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

-- -----------------------------------------------------------------------------
-- accept_invitation — the signed-in user, with a verified e-mail matching the
-- invitation, joins the company with the invited role.
-- -----------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_email      text;
  v_confirmed  timestamptz;
  v_invitation public.company_invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  if p_token is null or length(p_token) not between 32 and 256 then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;

  select lower(u.email), u.email_confirmed_at into v_email, v_confirmed
  from auth.users u where u.id = v_uid;

  if v_confirmed is null then
    raise exception 'Verify your e-mail address before accepting the invitation' using errcode = '42501';
  end if;

  select * into v_invitation
  from public.company_invitations
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update;

  if not found or v_invitation.revoked_at is not null then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if v_invitation.accepted_at is not null then
    raise exception 'Invitation already used' using errcode = '22023';
  end if;
  if v_invitation.expires_at <= now() then
    raise exception 'Invitation expired' using errcode = '22023';
  end if;
  if v_invitation.email <> v_email then
    raise exception 'This invitation was sent to a different e-mail address' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.company_members
    where company_id = v_invitation.company_id and user_id = v_uid
  ) then
    raise exception 'You are already a member of this company' using errcode = '23505';
  end if;

  insert into public.company_members (company_id, user_id, role, invited_by)
  values (v_invitation.company_id, v_uid, v_invitation.role, v_invitation.invited_by);

  update public.company_invitations
  set accepted_at = now(), accepted_by = v_uid
  where id = v_invitation.id;

  return v_invitation.company_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- transfer_ownership — current Owner hands over to another member and
-- becomes Admin. Exactly one Owner exists at every moment.
-- -----------------------------------------------------------------------------
create or replace function public.transfer_ownership(p_company_id uuid, p_new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.company_members
    where company_id = p_company_id and user_id = v_uid and role = 'owner'
    for update
  ) then
    raise exception 'Only the owner can transfer ownership' using errcode = '42501';
  end if;

  if p_new_owner_id = v_uid then
    raise exception 'You already own this company' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.company_members
    where company_id = p_company_id and user_id = p_new_owner_id
    for update
  ) then
    raise exception 'The new owner must already be a member of the company' using errcode = '22023';
  end if;

  update public.company_members set role = 'admin'
  where company_id = p_company_id and user_id = v_uid;

  update public.company_members set role = 'owner'
  where company_id = p_company_id and user_id = p_new_owner_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Execute privileges
-- -----------------------------------------------------------------------------
revoke all on function public.create_company(text, text, text, text) from public, anon;
revoke all on function public.get_invitation(text) from public;
revoke all on function public.accept_invitation(text) from public, anon;
revoke all on function public.transfer_ownership(uuid, uuid) from public, anon;

grant execute on function public.create_company(text, text, text, text) to authenticated;
grant execute on function public.get_invitation(text) to anon, authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
