-- Phase 15: body check-in. Measurements, body fat, a note and progress photos per check-in; the
-- daily kcal quick entry on `body_days`; weigh-ins remember where they came from. Same rules as
-- the other Body tables. Photos live in the private bucket `body-photos` under
-- `<user id>/<check-in id>/<slot>.<ext>`: only the owner reads them (signed URLs, never public),
-- only an active add-on writes them.

alter table public.body_checkins
  add column source text not null default 'manual' check (source in ('manual', 'import'));

-- A quick kcal entry creates the day row, so `incomplete` needs a default now.
alter table public.body_days
  alter column incomplete set default false,
  add column intake_kcal integer check (intake_kcal between 0 and 15000),
  add column active_kcal integer check (active_kcal between 0 and 10000);

create table public.body_measurements (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (length(id) <= 64),
  day date not null,
  "values" jsonb not null default '{}' check (pg_column_size("values") < 2000),
  body_fat_pct numeric(4, 1) check (body_fat_pct between 2 and 70),
  body_fat_source text check (body_fat_source in ('manual', 'navy', 'scale')),
  note text check (length(note) <= 1000),
  -- { front | side | back: storage path } – paths only, never URLs.
  photos jsonb not null default '{}' check (pg_column_size(photos) < 2000),
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index body_measurements_day on public.body_measurements (user_id, day);

alter table public.body_measurements enable row level security;

create policy "Users read their own check-ins"
  on public.body_measurements for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Subscribers add check-ins"
  on public.body_measurements for insert to authenticated
  with check ((select auth.uid()) = user_id and public.can_write_body_addon());
create policy "Subscribers change check-ins"
  on public.body_measurements for update to authenticated
  using ((select auth.uid()) = user_id and public.can_write_body_addon())
  with check ((select auth.uid()) = user_id);
create policy "Subscribers delete check-ins"
  on public.body_measurements for delete to authenticated
  using ((select auth.uid()) = user_id and public.can_write_body_addon());

revoke all on public.body_measurements from anon, authenticated;
grant select, insert, update, delete on public.body_measurements to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Private bucket for progress photos (JPEG, PNG, HEIC or WebP, at most 5 MB each).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'body-photos', 'body-photos', false, 5242880,
  array['image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
on conflict (id) do update set public = false;

create policy "Users read their own progress photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Subscribers upload progress photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'body-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_write_body_addon()
  );
create policy "Subscribers replace progress photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = (select auth.uid())::text and public.can_write_body_addon());
-- Deleting one's own photos always works (also after the add-on ended – privacy first).
create policy "Users delete their own progress photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
