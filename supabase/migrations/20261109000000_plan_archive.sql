-- Plan history (CLAUDE.md "Plan history"): a new plan in the same account archives the old one.
--
-- The archived plan is a read-only snapshot of its full state (weeks, workouts with their status,
-- pauses) plus its outcome and summary, one row per plan. Done and skipped sessions are the
-- user's history (Insights "All time", badges, the "How was your last plan?" review). The old row
-- in `plans` is deleted as before (its workouts go with it); the snapshot replaces them.
--
-- outcome: completed (ran through all weeks, ≥ 80 % of the sessions done) | finished (ran
--   through, fewer done) | replaced (a new plan started before its end – never completed).
-- deleted: a same-day "undo" brings the plan back and removes its archive row (soft, so it syncs).

create table public.plan_archive (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (length(id) between 1 and 64),
  input jsonb not null,
  goal jsonb not null,
  start_date date not null,
  end_date date not null,
  archived_at timestamptz not null,
  outcome text not null check (outcome in ('completed', 'finished', 'replaced')),
  summary jsonb not null,
  review jsonb,
  state jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

comment on table public.plan_archive is
  'Archived training plans (read-only snapshots with outcome and summary); synced from the app, last write wins.';

create index plan_archive_sync on public.plan_archive (user_id, server_updated_at);

create trigger plan_archive_last_write_wins before insert or update on public.plan_archive
  for each row execute function public.sync_last_write_wins();

alter table public.plan_archive enable row level security;

create policy "Users read their own archived plans"
  on public.plan_archive for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users archive their own plans"
  on public.plan_archive for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own archived plans"
  on public.plan_archive for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No delete for the app (soft delete syncs); rows go away with the account.
revoke all on public.plan_archive from anon, authenticated;
grant select, insert, update on public.plan_archive to authenticated;
