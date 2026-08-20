-- GLP — Supabase schema
-- Run this once in your project's SQL Editor (or via `supabase db push` if you
-- manage migrations with the Supabase CLI). Safe to re-run: uses IF NOT EXISTS
-- / CREATE OR REPLACE where practical, but table creation will error if the
-- tables already exist — drop them first if you need to re-run from scratch.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Core provider-side data
-- ---------------------------------------------------------------------------

create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  address text,
  city text,
  state text,
  zip text,
  lat double precision,
  lng double precision,
  phone text,
  hours text,
  veteran_support boolean not null default false,
  green_options boolean not null default false,
  accessibility boolean not null default false,
  livestreaming boolean not null default false,
  online_arrangement boolean not null default false,
  reception_facilities boolean not null default false
);

create table taxonomy (
  id text primary key,
  label text not null,
  examples text default ''
);

create table offerings (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  -- Deliberately not a FK to taxonomy(id): the admin "delete category" flow
  -- allows removing a category that's still referenced by offerings (it just
  -- reports how many were affected as a warning, not a hard block), matching
  -- how this worked before the Postgres migration.
  category text not null,
  name text not null,
  description text default '',
  price_type text not null check (price_type in ('fixed','starting_at','range','quote_required','included_in_package')),
  amount numeric,
  amount_min numeric,
  amount_max numeric,
  currency text not null default 'USD',
  effective_date timestamptz,
  reviewed_date timestamptz not null default now(),
  included text[] not null default '{}',
  excluded text[] not null default '{}',
  third_party jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft','pending_review','published','unpublished'))
);

create table offering_history (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  snapshot jsonb not null,
  versioned_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- People: one profiles row per Supabase Auth user, carrying app-specific role
-- info. role='consumer' | 'provider' | 'platform_admin'. org_id/provider_role
-- only apply to role='provider'.
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('consumer','provider','platform_admin')),
  name text not null,
  -- Denormalized from auth.users so the backend can look up e.g. "every
  -- provider user's email for this org" without extra admin-API round trips.
  email text,
  org_id uuid references orgs(id),
  provider_role text check (provider_role in ('owner','administrator','lead_manager')),
  request_updates boolean not null default true,
  planning_resources boolean not null default false,
  provider_offers boolean not null default false,
  do_not_contact boolean not null default false,
  created_at timestamptz not null default now()
);

-- Create the profile for any new Supabase Auth user (covers email/password
-- signup and Google OAuth signup, which never goes through our own code).
--
-- The signup form asks for an account type so that one login form can route
-- people to the right area afterwards, and it arrives here as
-- raw_user_meta_data.account_type. That metadata is supplied by whoever called
-- signUp, so it is UNTRUSTED: only 'consumer' and 'provider' are honoured.
--
-- 'platform_admin' is deliberately unreachable through signup. Accepting it
-- would let anyone hand themselves the admin back office — organization
-- verification, listing takedown, the full audit log — from a dropdown on a
-- public form. Platform admins are granted out of band (see the note below).
-- Anything unrecognised falls back to 'consumer', so hostile or malformed
-- values fail closed to the least-privileged role.
create function public.handle_new_user()
returns trigger as $$
declare
  requested text := new.raw_user_meta_data->>'account_type';
  resolved  text;
begin
  resolved := case
    when requested in ('consumer', 'provider') then requested
    else 'consumer'
  end;

  insert into public.profiles (id, role, name, email)
  values (
    new.id,
    resolved,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Granting a platform admin, or attaching a self-registered provider to an
-- organization, is a service_role operation and has no self-service path:
--
--   update public.profiles set role = 'platform_admin' where email = '...';
--   update public.profiles set org_id = '<org uuid>', provider_role = 'owner'
--     where email = '...';
--
-- A provider who signs themselves up has org_id null until someone does that,
-- which is why the portal shows a "not linked to an organization yet" state
-- rather than an empty dashboard.

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The trigger fires regardless of role-level EXECUTE grants; revoking these
-- just closes off calling the function directly as a PostgREST RPC (it would
-- fail anyway, since trigger-returning functions can't be invoked directly,
-- but the security linter flags the exposed grant either way).
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Consumer-owned data
-- ---------------------------------------------------------------------------

create table saved_providers (
  id uuid primary key default gen_random_uuid(),
  consumer_id uuid not null references profiles(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (consumer_id, location_id)
);

create table saved_comparisons (
  id uuid primary key default gen_random_uuid(),
  consumer_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  offering_ids uuid[] not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------

create table leads (
  id uuid primary key default gen_random_uuid(),
  client_request_id text unique,
  consumer_id uuid references profiles(id),
  location_id uuid not null references locations(id),
  offering_id uuid references offerings(id),
  offering_snapshot jsonb,
  first_name text not null,
  last_name text not null,
  contact_method text not null default 'no_preference',
  phone text,
  email text,
  need_type text not null,
  timeframe text,
  message text default '',
  consent_to_contact boolean not null default false,
  marketing_opt_in boolean not null default false,
  consent_version text,
  consent_timestamp timestamptz,
  status text not null default 'new' check (status in ('new','contacted','appointment_scheduled','quoted','converted','closed_lost','do_not_contact')),
  owner uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table lead_status_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  status text not null,
  at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Platform admin data
-- ---------------------------------------------------------------------------

create table pricing_reports (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id),
  offering_name text,
  provider_name text,
  reason text not null,
  details text default '',
  consumer_id uuid references profiles(id),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  entity text,
  from_value text,
  to_value text,
  at timestamptz not null default now()
);

create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  meta jsonb not null default '{}',
  at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security — the Express backend is the only intended data path,
-- using the service_role key (which bypasses RLS entirely). These tables get
-- RLS enabled with NO permissive policies, so if the anon/authenticated key
-- ever touched them directly (e.g. a future direct-from-client query), the
-- default is deny-all rather than wide open.
-- ---------------------------------------------------------------------------

alter table orgs enable row level security;
alter table locations enable row level security;
alter table taxonomy enable row level security;
alter table offerings enable row level security;
alter table offering_history enable row level security;
alter table profiles enable row level security;
alter table saved_providers enable row level security;
alter table saved_comparisons enable row level security;
alter table leads enable row level security;
alter table lead_status_history enable row level security;
alter table pricing_reports enable row level security;
alter table audit_log enable row level security;
alter table analytics_events enable row level security;

-- Profiles are the one exception: a signed-in user reading/updating their own
-- row has no business logic attached (unlike search, leads, moderation, etc.),
-- so it's fine to let the frontend do this directly against Supabase with the
-- anon key instead of round-tripping through Express.
create policy "Users can read their own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update their own comm prefs"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- RLS policies filter ROWS, not columns — without this, the update policy
-- above would let a signed-in user rewrite their own role/org_id/provider_role
-- directly (e.g. self-promote to platform_admin). Revoke the blanket UPDATE
-- grant and hand back only the four comm-preference columns.
revoke update on profiles from authenticated;
grant update (request_updates, planning_resources, provider_offers, do_not_contact) on profiles to authenticated;
