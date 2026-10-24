-- Phase 10b: the website funnel (CLAUDE.md "Web funnel flow"). The quiz runs under an anonymous
-- Supabase user; its answers live in `quiz_sessions`. Stripe Checkout sessions are recorded in
-- `web_checkouts` by the website's server (service role) so that the purchase can be attached to
-- the account that is created afterwards, and so that buyers who never create one get a reminder.

-- ---------------------------------------------------------------------------------------------
-- Quiz answers of the website funnel: one row per (anonymous, later real) user. Written by the
-- website with the visitor's own session, so Row Level Security applies.

create table public.quiz_sessions (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- The given answers (defaults are derived, not stored), as in the app's local quiz progress.
  answers jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'
    and pg_column_size(answers) <= 32768),
  step_id text check (length(step_id) <= 40),
  finished boolean not null default false,
  -- The visitor's local date when the quiz was finished (plan start and date questions).
  quiz_date date,
  -- Optional email before the forecast, only with consent to follow-up emails.
  email text check (email = lower(email) and length(email) <= 254
    and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Exact consent wording and time (GDPR / revDSG proof of consent).
  email_consent_text text check (length(email_consent_text) <= 1000),
  email_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is null or (email_consent_at is not null and email_consent_text is not null))
);

comment on table public.quiz_sessions is
  'Website quiz answers per user (anonymous until the account is created), resumable.';

create trigger quiz_sessions_touch before update on public.quiz_sessions
  for each row execute function public.touch_updated_at();

alter table public.quiz_sessions enable row level security;

create policy "Users read their own quiz session"
  on public.quiz_sessions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create their own quiz session"
  on public.quiz_sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own quiz session"
  on public.quiz_sessions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.quiz_sessions from anon, authenticated;
grant select on public.quiz_sessions to authenticated;
grant insert (user_id, answers, step_id, finished, quiz_date, email, email_consent_text,
  email_consent_at) on public.quiz_sessions to authenticated;
grant update (answers, step_id, finished, quiz_date, email, email_consent_text, email_consent_at)
  on public.quiz_sessions to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Stripe Checkout sessions of the website. `user_id` is the current owner: the anonymous quiz
-- user until the account claims it. Written by the website server only (service role).

create table public.web_checkouts (
  session_id text primary key check (length(session_id) between 1 and 255),
  user_id uuid references auth.users (id) on delete cascade,
  email text check (length(email) <= 254),
  customer_id text check (length(customer_id) <= 255),
  subscription_id text check (length(subscription_id) <= 255),
  tier text not null check (tier in ('training', 'plus')),
  period text not null check (period in ('monthly', 'yearly')),
  -- Whether the checkout started with the 7-day trial (one trial per user).
  with_trial boolean not null,
  trial_end timestamptz,
  status text not null default 'open' check (status in ('open', 'complete', 'expired')),
  -- The account took it over (answers, plan, subscription).
  claimed_at timestamptz,
  -- "Create your account" email to a buyer who never did.
  reminded_at timestamptz,
  -- Set when the subscription was cancelled at once, e.g. 'already_subscribed'.
  cancelled_reason text check (length(cancelled_reason) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.web_checkouts is
  'Website Stripe Checkout sessions and who owns them (written by the website server only).';

create trigger web_checkouts_touch before update on public.web_checkouts
  for each row execute function public.touch_updated_at();

create index web_checkouts_user on public.web_checkouts (user_id);
create index web_checkouts_email on public.web_checkouts (lower(email));
create index web_checkouts_customer on public.web_checkouts (customer_id);
create index web_checkouts_unclaimed on public.web_checkouts (created_at)
  where status = 'complete' and claimed_at is null and reminded_at is null;

alter table public.web_checkouts enable row level security;

create policy "Users read their own web checkouts"
  on public.web_checkouts for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.web_checkouts from anon, authenticated;
grant select on public.web_checkouts to authenticated;

-- ---------------------------------------------------------------------------------------------
-- What the funnel needs to know about an email before and after checkout (service role only):
-- the account it belongs to, whether that account has `training` right now, and whether this
-- email or account ever started a trial (one trial per user).

create function public.funnel_email_status(addr text)
returns table (account_id uuid, has_training boolean, had_trial boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with account as (
    select u.id from auth.users u
    where lower(u.email) = lower(addr) and not coalesce(u.is_anonymous, false)
    limit 1
  )
  select
    (select id from account),
    coalesce((select public.has_entitlement(id, 'training') from account), false),
    exists (
      select 1 from public.web_checkouts c
      where c.with_trial and c.status = 'complete'
        and (lower(c.email) = lower(addr) or c.user_id = (select id from account))
    ) or exists (
      select 1 from public.entitlements e
      where e.user_id = (select id from account) and e.entitlement in ('training', 'plus')
    );
$$;

revoke all on function public.funnel_email_status(text) from public, anon, authenticated;
grant execute on function public.funnel_email_status(text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Hourly: buyers who paid but never created their account get one reminder with a link back to
-- the success page (Edge Function `checkout-reminders`). URL and secret from Vault, like the
-- trial reminder.

select cron.schedule(
  'checkout-account-reminders',
  '47 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/checkout-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
