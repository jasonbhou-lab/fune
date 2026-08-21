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
  -- True when the account type had to be guessed rather than asked for, which
  -- is every OAuth signup: Google sign-in never passes through our signup form,
  -- so no account_type is supplied and the role below is a fallback. The app
  -- holds these accounts at a role prompt instead of routing them, and
  -- claim_account_type() is the one-time path to answer it.
  role_pending boolean not null default false,
  -- Which organization a self-registered provider SAYS they belong to. This is a
  -- request, never membership: org_id above is what unlocks an organization's
  -- leads, and a lead carries a bereaved family's name, phone, email and
  -- circumstances. Letting signup set org_id directly would let anyone register,
  -- pick an established funeral home and read its families' contact details, so
  -- a platform admin approves and only then is org_id written.
  --
  -- A pending claim names exactly one of these: an existing organization, or a
  -- new name to create on approval.
  requested_org_id uuid references orgs(id) on delete set null,
  requested_org_name text,
  org_claim_status text not null default 'none'
    check (org_claim_status in ('none', 'pending', 'rejected')),
  constraint profiles_org_claim_shape_check check (
    org_claim_status <> 'pending'
    or ((requested_org_id is not null) <> (requested_org_name is not null))
  ),
  constraint profiles_requested_org_name_check check (
    requested_org_name is null or char_length(btrim(requested_org_name)) between 2 and 200
  ),
  created_at timestamptz not null default now()
);

create index profiles_org_claim_pending_idx
  on profiles (org_claim_status)
  where org_claim_status = 'pending';

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
  requested   text := new.raw_user_meta_data->>'account_type';
  req_org_raw text := new.raw_user_meta_data->>'requested_org_id';
  req_name    text := btrim(coalesce(new.raw_user_meta_data->>'requested_org_name', ''));
  resolved    text;
  pending     boolean;
  claim_org   uuid;
  claim_name  text;
  claim_state text := 'none';
begin
  -- Remember whether we had to guess. Falling back to 'consumer' is the right
  -- safe default, but silently applying it to every Google signup made them
  -- consumers for good with no way to say otherwise, so record that the
  -- question still needs asking.
  pending  := requested is null or requested not in ('consumer', 'provider');
  resolved := case when pending then 'consumer' else requested end;

  -- An organization claim only means anything for a provider, and it is only
  -- ever a request. Same rule as the account type: this metadata is supplied by
  -- whoever called signUp, so an org id is honoured only when it names an
  -- organization that exists, a free-text name is trimmed and length-checked,
  -- and neither one ever touches org_id.
  if resolved = 'provider' then
    begin
      claim_org := nullif(req_org_raw, '')::uuid;
    exception when others then
      -- Not a uuid. Drop the claim rather than failing the whole signup.
      claim_org := null;
    end;

    if claim_org is not null and not exists (select 1 from public.orgs where id = claim_org) then
      claim_org := null;
    end if;

    if claim_org is not null then
      claim_state := 'pending';
    elsif char_length(req_name) between 2 and 200 then
      claim_name  := req_name;
      claim_state := 'pending';
    end if;
  end if;

  insert into public.profiles (
    id, role, name, email, role_pending,
    requested_org_id, requested_org_name, org_claim_status
  )
  values (
    new.id,
    resolved,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    pending,
    claim_org,
    claim_name,
    claim_state
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- The one-time answer to that question.
--
-- `role` is deliberately not writable by the authenticated role (see the column
-- grants further down), because a signed-in user who could rewrite it would
-- self-promote to platform_admin. This function is the only self-service path to
-- setting it, and it is narrow by construction:
--
--   * 'platform_admin' is not accepted, so it cannot escalate;
--   * it only ever touches auth.uid()'s own row;
--   * it only acts while role_pending is true, and clears the flag in the same
--     statement, so it cannot be replayed later to flip between roles;
--   * it refuses to act on a platform_admin row, so an admin promoted after an
--     OAuth signup cannot be talked into downgrading themselves.
-- A provider answering here must also name their organization, since a provider
-- account with no organization can do nothing in the portal. It lands as a
-- pending claim exactly like the email-signup path above.
create function public.claim_account_type(
  p_account_type text,
  p_org_id uuid default null,
  p_org_name text default null
) returns text as $$
declare
  resolved    text;
  uid         uuid := auth.uid();
  claim_org   uuid := p_org_id;
  claim_name  text := btrim(coalesce(p_org_name, ''));
  claim_state text := 'none';
begin
  if uid is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  if p_account_type is null or p_account_type not in ('consumer', 'provider') then
    raise exception 'Choose either consumer or provider.' using errcode = '22023';
  end if;

  if p_account_type = 'provider' then
    if claim_org is not null then
      if not exists (select 1 from public.orgs where id = claim_org) then
        raise exception 'That organization could not be found.' using errcode = '23503';
      end if;
      claim_name  := null;
      claim_state := 'pending';
    elsif char_length(claim_name) between 2 and 200 then
      claim_org   := null;
      claim_state := 'pending';
    else
      raise exception 'Choose your organization, or enter its name.' using errcode = '22023';
    end if;
  else
    claim_org  := null;
    claim_name := null;
  end if;

  update public.profiles
     set role               = p_account_type,
         role_pending       = false,
         requested_org_id   = claim_org,
         requested_org_name = nullif(claim_name, ''),
         org_claim_status   = claim_state
   where id = uid
     and role_pending
     and role in ('consumer', 'provider')
  returning role into resolved;

  if resolved is null then
    raise exception 'This account already has an account type.' using errcode = '42501';
  end if;

  return resolved;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function public.claim_account_type(text, uuid, text) from public, anon;
grant execute on function public.claim_account_type(text, uuid, text) to authenticated;

-- Granting a platform admin, or attaching a self-registered provider to an
-- organization, is a service_role operation and has no self-service path:
--
--   update public.profiles set role = 'platform_admin', role_pending = false
--     where email = '...';
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

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------

-- A consumer's 1-5 star rating of a provider, with optional prose. Live on
-- submit, one per person per organization, editable by its author, answerable
-- once by the provider, reportable by anyone, hideable by a platform admin.
--
-- Attached to the organization rather than the location because the org is what
-- the consumer UI calls "the provider" everywhere — serializeForSearch sends
-- providerName: org.name, and the offer page shows the same — so it is what a
-- reviewer believes they are rating.
create table reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  -- Optional: a star-only review is legitimate, same as Google.
  body text check (body is null or char_length(body) <= 4000),

  -- 'published' is public. 'hidden' is an admin takedown: it drops out of every
  -- consumer response AND out of the rating average. Authors delete their own
  -- outright, so there is no author-facing state here.
  status text not null default 'published' check (status in ('published', 'hidden')),
  hidden_reason text,

  -- The provider's public answer. One reply per review, like Google's
  -- "Response from the owner".
  response_body text check (response_body is null or char_length(response_body) <= 4000),
  response_author_id uuid references profiles(id) on delete set null,
  response_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Re-reviewing edits the original. Without this, one unhappy customer could
  -- become ten one-star rows.
  unique (org_id, author_id)
);

create index reviews_org_published_idx on reviews (org_id, created_at desc) where status = 'published';
create index reviews_author_idx on reviews (author_id);

create table review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reviews(id) on delete cascade,
  reporter_id uuid references profiles(id) on delete set null,
  reason text not null check (reason in ('spam', 'off_topic', 'not_a_customer', 'offensive', 'privacy', 'other')),
  details text default '',
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

create index review_reports_open_idx on review_reports (status, created_at desc) where status = 'open';

-- Rating aggregates, including the 1-5 histogram shown as bars.
--
-- A view rather than denormalised columns on orgs: these are derived numbers,
-- and a trigger-maintained copy is one more thing that can drift out of step
-- with reality. security_invoker keeps row-level security on reviews applying to
-- whoever selects from the view, rather than to the view's owner.
create view org_review_stats with (security_invoker = on) as
select
  org_id,
  count(*)::int as review_count,
  round(avg(rating)::numeric, 2) as rating_avg,
  count(*) filter (where rating = 5)::int as count_5,
  count(*) filter (where rating = 4)::int as count_4,
  count(*) filter (where rating = 3)::int as count_3,
  count(*) filter (where rating = 2)::int as count_2,
  count(*) filter (where rating = 1)::int as count_1
from reviews
where status = 'published'
group by org_id;

-- Keep updated_at honest without trusting the caller to send it.
create function public.touch_reviews_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql set search_path = public;

create trigger reviews_touch_updated_at
  before update on reviews
  for each row execute function public.touch_reviews_updated_at();

revoke execute on function public.touch_reviews_updated_at() from public, anon, authenticated;

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
-- Reviews are public data, but they are still served through the backend like
-- everything else: reading them applies sort/filter caps and hides admin
-- takedowns, and writing one has to enforce one-per-person and authorship.
alter table reviews enable row level security;
alter table review_reports enable row level security;
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
