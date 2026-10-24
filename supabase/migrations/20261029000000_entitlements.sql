-- Phase 10: subscriptions (CLAUDE.md "Monetisation"). RevenueCat is the single source of
-- entitlements; the Edge Function `revenuecat-webhook` mirrors each user's state here so the
-- backend can check access and send the trial-ending reminder. The app itself reads RevenueCat.

-- ---------------------------------------------------------------------------------------------
-- One row per user and entitlement (`training`, `plus`, `gym`), active or expired: `expires_at`
-- decides. Replaced as a whole for a user on every RevenueCat event.

create table public.entitlements (
  user_id uuid not null references auth.users (id) on delete cascade,
  entitlement text not null check (entitlement in ('training', 'plus', 'gym')),
  product_id text not null check (length(product_id) <= 200),
  store text not null check (store in ('play_store', 'app_store', 'stripe', 'other')),
  -- trial | normal | intro | prepaid
  period_type text not null check (length(period_type) <= 20),
  will_renew boolean not null,
  -- Null: does not expire.
  expires_at timestamptz,
  -- Localised price ("CHF 59.00") the app stored as a RevenueCat subscriber attribute.
  price_string text check (length(price_string) <= 40),
  management_url text check (length(management_url) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (user_id, entitlement)
);

comment on table public.entitlements is
  'Mirror of RevenueCat entitlements per user (written by revenuecat-webhook only).';

create index entitlements_trials on public.entitlements (expires_at)
  where period_type = 'trial' and will_renew;

alter table public.entitlements enable row level security;

create policy "Users read their own entitlements"
  on public.entitlements for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;

-- Whether a user has an entitlement right now; for Edge Functions and later RLS policies.
create function public.has_entitlement(uid uuid, name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = uid
      and (e.entitlement = name or (name = 'training' and e.entitlement = 'plus'))
      and (e.expires_at is null or e.expires_at > now())
  );
$$;

revoke all on function public.has_entitlement(uuid, text) from public, anon, authenticated;
grant execute on function public.has_entitlement(uuid, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Trial-ending reminders that went out: one per trial (user, product, first charge). Service role
-- only.

create table public.trial_reminders (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null,
  charge_at timestamptz not null,
  pushed boolean not null default false,
  emailed boolean not null default false,
  sent_at timestamptz not null default now(),
  primary key (user_id, product_id, charge_at)
);

alter table public.trial_reminders enable row level security;
revoke all on public.trial_reminders from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Hourly: trials that convert within 24 hours get their reminder (Edge Function
-- `trial-reminders`). URL and secret from Vault, like the nightly Strava catch-up.

select cron.schedule(
  'trial-ending-reminders',
  '17 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/trial-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
