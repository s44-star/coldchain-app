-- =============================================================================
-- ColdChain OS · 0002_identity_tenancy
-- Profiles, companies (tenants), memberships, invitations, platform admins.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles — 1:1 with auth.users, created automatically on signup
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null check (email = lower(email) and char_length(email) <= 254),
  full_name   text check (char_length(full_name) <= 120),
  phone       text check (char_length(phone) <= 32),
  locale      text not null default 'en' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  timezone    text not null default 'UTC' check (private.is_valid_timezone(timezone)),
  avatar_path text check (char_length(avatar_path) <= 512),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_email_idx on public.profiles (email);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger profiles_guard_columns
  before update on public.profiles
  for each row execute function private.guard_immutable_columns('id', 'email', 'created_at');

-- Create / sync a profile whenever an auth user is created or changes e-mail.
create or replace function private.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id, email, full_name)
    values (
      new.id,
      lower(coalesce(new.email, new.id::text || '@users.invalid')),
      nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120), '')
    )
    on conflict (id) do nothing;
  elsif tg_op = 'UPDATE' and new.email is distinct from old.email and new.email is not null then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_auth_user_change();

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.handle_auth_user_change();

-- -----------------------------------------------------------------------------
-- companies — the tenant
-- -----------------------------------------------------------------------------
create table public.companies (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null check (char_length(trim(name)) between 2 and 160),
  country_code                char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  vat_number                  text check (char_length(vat_number) <= 32),
  registration_number         text check (char_length(registration_number) <= 64),
  billing_email               text check (billing_email = lower(billing_email) and char_length(billing_email) <= 254),
  address_line1               text check (char_length(address_line1) <= 200),
  address_line2               text check (char_length(address_line2) <= 200),
  city                        text check (char_length(city) <= 120),
  postal_code                 text check (char_length(postal_code) <= 20),
  status                      public.company_status not null default 'trial',
  trial_ends_at               timestamptz,
  is_demo                     boolean not null default false,
  -- Alert severity defaults (configurable per company)
  critical_temp_excursion_c   numeric(4, 1) not null default 2.0
                              check (critical_temp_excursion_c between 0 and 50),
  critical_humidity_excursion numeric(4, 1) not null default 10.0
                              check (critical_humidity_excursion between 0 and 100),
  missing_reading_factor      numeric(3, 1) not null default 2.0
                              check (missing_reading_factor between 1 and 10),
  created_by                  uuid references public.profiles (id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index companies_status_idx on public.companies (status);
create index companies_created_by_idx on public.companies (created_by);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function private.set_updated_at();

create trigger companies_guard_columns
  before update on public.companies
  for each row execute function private.guard_immutable_columns('id', 'created_by', 'created_at');

-- -----------------------------------------------------------------------------
-- company_members — user ↔ company with a role
-- -----------------------------------------------------------------------------
create table public.company_members (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.member_role not null,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

-- Exactly one owner per company.
create unique index company_members_one_owner_idx
  on public.company_members (company_id) where role = 'owner';
create index company_members_user_idx on public.company_members (user_id);
create index company_members_invited_by_idx on public.company_members (invited_by);

create trigger company_members_set_updated_at
  before update on public.company_members
  for each row execute function private.set_updated_at();

create trigger company_members_guard_columns
  before update on public.company_members
  for each row execute function private.guard_immutable_columns('id', 'company_id', 'user_id', 'invited_by', 'created_at');

-- -----------------------------------------------------------------------------
-- company_invitations — the raw token is e-mailed; only its SHA-256 is stored
-- -----------------------------------------------------------------------------
create table public.company_invitations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  email       text not null check (
                email = lower(email)
                and char_length(email) <= 254
                and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
              ),
  role        public.member_role not null check (role <> 'owner'),
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by  uuid references public.profiles (id) on delete set null,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (expires_at > created_at)
);

-- One pending invitation per e-mail per company.
create unique index company_invitations_pending_idx
  on public.company_invitations (company_id, email)
  where accepted_at is null and revoked_at is null;
create index company_invitations_invited_by_idx on public.company_invitations (invited_by);
create index company_invitations_accepted_by_idx on public.company_invitations (accepted_by);

create trigger company_invitations_set_updated_at
  before update on public.company_invitations
  for each row execute function private.set_updated_at();

create trigger company_invitations_guard_columns
  before update on public.company_invitations
  for each row execute function private.guard_immutable_columns(
    'id', 'company_id', 'email', 'role', 'token_hash', 'invited_by', 'expires_at',
    'accepted_at', 'accepted_by', 'created_at'
  );

-- -----------------------------------------------------------------------------
-- platform_admins — super admins; granted only by SQL, never from the app
-- -----------------------------------------------------------------------------
create table public.platform_admins (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  note       text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);
