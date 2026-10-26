-- Phase 12: energy engine of the Body add-on. Same rules as 20261103000000_body_addon.sql: read
-- one's own rows always, write only with the add-on (entitlement + flag, `can_write_body_addon`).
-- Health Connect / HealthKit values are not stored here – they stay on the device.

alter table public.body_checkins
  add column body_fat_pct numeric(4, 1) check (body_fat_pct between 3 and 70);

-- Days marked incomplete: left out of the adaptive TDEE and "calculation vs. scale".
create table public.body_days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  incomplete boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Every adaptive TDEE estimate with its data basis.
create table public.body_tdee_estimates (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  tdee_kcal integer not null check (tdee_kcal between 500 and 10000),
  raw_kcal integer not null,
  formula_kcal integer not null,
  correction_kcal integer not null,
  clamped boolean not null,
  basis jsonb not null check (pg_column_size(basis) < 4000),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- Every change of the daily intake target with its reason.
create table public.body_target_changes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  intake_kcal integer not null check (intake_kcal between 500 and 10000),
  reason text not null check (reason in ('user', 'adaptive', 'safety_clamp')),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

do $$
declare t text;
begin
  foreach t in array array['body_days', 'body_tdee_estimates', 'body_target_changes'] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      t || '_touch', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Users read their own rows" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "Subscribers add rows" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id and public.can_write_body_addon())', t);
    execute format(
      'create policy "Subscribers change rows" on public.%I for update to authenticated using ((select auth.uid()) = user_id and public.can_write_body_addon()) with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "Subscribers delete rows" on public.%I for delete to authenticated using ((select auth.uid()) = user_id and public.can_write_body_addon())', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
