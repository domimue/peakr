-- Phase 13: weight goal. Every version (change, pause, accepted suggestion) is a row with its
-- reason; the latest is the current goal. Same rules as the other Body tables. The safety rules
-- live in the engine; the checks here only keep values in a plausible range.

create table public.body_goals (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (length(id) <= 64),
  created_at timestamptz not null,
  kind text not null check (kind in ('lose', 'maintain', 'gain')),
  start_weight_kg numeric(5, 1) not null check (start_weight_kg between 25 and 350),
  target_weight_kg numeric(5, 1) check (target_weight_kg between 25 and 350),
  rate_per_week_kg numeric(4, 2) not null check (rate_per_week_kg between 0 and 1),
  eat_back_pct smallint not null check (eat_back_pct between 0 and 100),
  weekly_mode boolean not null,
  adjustment_kcal integer not null default 0 check (adjustment_kcal between -1500 and 1500),
  paused boolean not null default false,
  reason text not null check (reason in ('user', 'adaptive', 'safety_clamp')),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create trigger body_goals_touch before update on public.body_goals
  for each row execute function public.touch_updated_at();

alter table public.body_goals enable row level security;

create policy "Users read their own goals"
  on public.body_goals for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Subscribers add goals"
  on public.body_goals for insert to authenticated
  with check ((select auth.uid()) = user_id and public.can_write_body_addon());
create policy "Subscribers change goals"
  on public.body_goals for update to authenticated
  using ((select auth.uid()) = user_id and public.can_write_body_addon())
  with check ((select auth.uid()) = user_id);

revoke all on public.body_goals from anon, authenticated;
grant select, insert, update on public.body_goals to authenticated;
