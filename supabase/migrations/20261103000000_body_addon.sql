-- Phase 11b: the Body add-on (nutrition & body, CLAUDE.md "Add-on rules"). One entitlement,
-- `body_nutrition`, granted by the add-on products and by the bundle "Peakr + Body" (`plus`).
-- The app hides and locks screens; this file makes sure the data follows the same rules even when
-- a client ignores them: writes need the entitlement and the remote flag, reads of one's own data
-- always work (a cancelled add-on keeps its history readable and exportable).

-- ---------------------------------------------------------------------------------------------
-- Entitlements: `body_nutrition` joins the mirror written by `revenuecat-webhook`.

alter table public.entitlements drop constraint entitlements_entitlement_check;
alter table public.entitlements
  add constraint entitlements_entitlement_check
    check (entitlement in ('training', 'plus', 'gym', 'body_nutrition'));

-- The bundle grants training and Body; RevenueCat attaches both entitlements to its products, the
-- `plus` row is the fallback if one is missing.
create or replace function public.has_entitlement(uid uuid, name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = uid
      and (
        e.entitlement = name
        or (name in ('training', 'body_nutrition') and e.entitlement = 'plus')
      )
      and (e.expires_at is null or e.expires_at > now())
  );
$$;

-- The signed-in user's own entitlement, for RLS policies (reveals nothing about anyone else).
create function public.has_own_entitlement(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_entitlement((select auth.uid()), name);
$$;

revoke all on function public.has_own_entitlement(text) from public, anon;
grant execute on function public.has_own_entitlement(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Remote feature flags: features that ship hidden and are switched on here without a release.
-- Everyone may read them (the app reads them before sign-in); only the service role writes.

create table public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_]{1,64}$'),
  enabled boolean not null default false,
  note text check (length(note) <= 500),
  updated_at timestamptz not null default now()
);

comment on table public.feature_flags is
  'Remote feature flags read by app and web. Switch with: update feature_flags set enabled = true where key = ...';

create trigger feature_flags_touch before update on public.feature_flags
  for each row execute function public.touch_updated_at();

alter table public.feature_flags enable row level security;

create policy "Anyone reads feature flags"
  on public.feature_flags for select to anon, authenticated
  using (true);

revoke all on public.feature_flags from anon, authenticated;
grant select on public.feature_flags to anon, authenticated;

insert into public.feature_flags (key, enabled, note) values
  ('addon_body_nutrition', false, 'Body add-on (Phase 11b): Body tab, Energy today card, add-on and bundle offers.');

create function public.flag_enabled(flag text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select f.enabled from public.feature_flags f where f.key = flag), false);
$$;

revoke all on function public.flag_enabled(text) from public;
grant execute on function public.flag_enabled(text) to anon, authenticated, service_role;

-- Writes to add-on data: the add-on is switched on and the user holds the entitlement.
create function public.can_write_body_addon()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.flag_enabled('addon_body_nutrition')
    and public.has_own_entitlement('body_nutrition');
$$;

revoke all on function public.can_write_body_addon() from public, anon;
grant execute on function public.can_write_body_addon() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Add-on trials: 14 days, once per account (whatever store or product). Written by the webhook
-- the first time a Body trial shows up and never removed; the app reads its own row to decide
-- whether to offer the trial at all.

create table public.addon_trials (
  user_id uuid not null references auth.users (id) on delete cascade,
  addon text not null check (addon in ('body_nutrition')),
  product_id text not null check (length(product_id) <= 200),
  started_at timestamptz not null default now(),
  primary key (user_id, addon)
);

comment on table public.addon_trials is 'Add-on free trials already used (one per account and add-on).';

alter table public.addon_trials enable row level security;

create policy "Users read their own add-on trials"
  on public.addon_trials for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.addon_trials from anon, authenticated;
grant select on public.addon_trials to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Shared profile values (CLAUDE.md "Add-on rules": one profile, no duplicate fields). The quiz
-- fills them, the add-on asks for missing ones inline; training and Body read the same columns.
-- `weight_kg` is the latest known weight; the history lives in `body_checkins`.

alter table public.profiles
  add column sex text check (sex in ('female', 'male')),
  add column birth_date date check (birth_date > '1900-01-01'),
  add column height_cm numeric(5, 1) check (height_cm between 100 and 250),
  add column weight_kg numeric(5, 1) check (weight_kg between 25 and 350);

grant update (sex, birth_date, height_cm, weight_kg) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Add-on data. Rows are the device's own records (ids from the app), synced up; deletes are
-- tombstoned by the app's sync like the rest of its data.

create table public.body_food_entries (
  id text primary key check (length(id) <= 64),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text not null check (length(name) between 1 and 200),
  kcal integer not null check (kcal between 0 and 10000),
  protein_g numeric(6, 1) check (protein_g between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index body_food_entries_day on public.body_food_entries (user_id, day);

create table public.body_checkins (
  id text primary key check (length(id) <= 64),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  weight_kg numeric(5, 1) not null check (weight_kg between 25 and 350),
  waist_cm numeric(5, 1) check (waist_cm between 30 and 250),
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index body_checkins_day on public.body_checkins (user_id, day);

create trigger body_food_entries_touch before update on public.body_food_entries
  for each row execute function public.touch_updated_at();
create trigger body_checkins_touch before update on public.body_checkins
  for each row execute function public.touch_updated_at();

alter table public.body_food_entries enable row level security;
alter table public.body_checkins enable row level security;

-- Reading one's own data always works: a cancelled add-on keeps its history and export.
create policy "Users read their own food entries"
  on public.body_food_entries for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users read their own check-ins"
  on public.body_checkins for select to authenticated
  using ((select auth.uid()) = user_id);

-- New entries, edits and deletes only with the add-on (entitlement + flag), checked here, not in
-- the app.
create policy "Subscribers add food entries"
  on public.body_food_entries for insert to authenticated
  with check ((select auth.uid()) = user_id and public.can_write_body_addon());
create policy "Subscribers change food entries"
  on public.body_food_entries for update to authenticated
  using ((select auth.uid()) = user_id and public.can_write_body_addon())
  with check ((select auth.uid()) = user_id);
create policy "Subscribers delete food entries"
  on public.body_food_entries for delete to authenticated
  using ((select auth.uid()) = user_id and public.can_write_body_addon());

create policy "Subscribers add check-ins"
  on public.body_checkins for insert to authenticated
  with check ((select auth.uid()) = user_id and public.can_write_body_addon());
create policy "Subscribers change check-ins"
  on public.body_checkins for update to authenticated
  using ((select auth.uid()) = user_id and public.can_write_body_addon())
  with check ((select auth.uid()) = user_id);
create policy "Subscribers delete check-ins"
  on public.body_checkins for delete to authenticated
  using ((select auth.uid()) = user_id and public.can_write_body_addon());

revoke all on public.body_food_entries, public.body_checkins from anon, authenticated;
grant select, insert, update, delete on public.body_food_entries, public.body_checkins
  to authenticated;
