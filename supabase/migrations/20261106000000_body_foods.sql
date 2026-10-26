-- Phase 14: food logging. Diary entries get macros and what they were made of; the user's foods
-- (Open Food Facts cache, own foods, recipes) sync like the rest of Body. Same rules: read own
-- rows always, write only with the add-on (`can_write_body_addon`).

alter table public.body_food_entries
  add column carbs_g numeric(6, 1) check (carbs_g between 0 and 2000),
  add column fat_g numeric(6, 1) check (fat_g between 0 and 1000),
  add column food_id text check (length(food_id) <= 64),
  add column amount numeric(8, 1) check (amount > 0 and amount < 100000),
  add column unit text check (unit in ('g', 'ml', 'piece', 'portion')),
  add column portion_label text check (length(portion_label) <= 100);

create table public.body_foods (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (length(id) <= 64),
  kind text not null check (kind in ('off', 'custom', 'recipe')),
  name text not null check (length(name) between 1 and 200),
  brand text check (length(brand) <= 200),
  barcode text check (barcode ~ '^[0-9]{6,14}$'),
  basis text not null check (basis in ('g', 'ml')),
  kcal numeric(6, 1) not null check (kcal between 0 and 1000),
  protein_g numeric(5, 1) not null check (protein_g between 0 and 100),
  carbs_g numeric(5, 1) not null check (carbs_g between 0 and 100),
  fat_g numeric(5, 1) not null check (fat_g between 0 and 100),
  piece_amount numeric(7, 1) check (piece_amount > 0),
  portions jsonb not null default '[]' check (pg_column_size(portions) < 4000),
  recipe jsonb check (pg_column_size(recipe) < 32000),
  favourite boolean not null default false,
  last_used_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index body_foods_updated on public.body_foods (user_id, updated_at);

alter table public.body_foods enable row level security;

create policy "Users read their own foods"
  on public.body_foods for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Subscribers add foods"
  on public.body_foods for insert to authenticated
  with check ((select auth.uid()) = user_id and public.can_write_body_addon());
create policy "Subscribers change foods"
  on public.body_foods for update to authenticated
  using ((select auth.uid()) = user_id and public.can_write_body_addon())
  with check ((select auth.uid()) = user_id);
create policy "Subscribers delete foods"
  on public.body_foods for delete to authenticated
  using ((select auth.uid()) = user_id and public.can_write_body_addon());

revoke all on public.body_foods from anon, authenticated;
grant select, insert, update, delete on public.body_foods to authenticated;
