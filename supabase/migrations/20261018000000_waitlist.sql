-- Waitlist for the website (Phase 1b). Full backend follows in Phase 6.
-- The website inserts with the public (anon/publishable) key; nobody can read rows with it.

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  -- Stored lower-cased so the unique constraint is case-insensitive.
  email text not null unique
    check (email = lower(email) and length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Exact consent wording the visitor agreed to, and when (GDPR / revDSG proof of consent).
  consent_text text not null check (length(consent_text) <= 1000),
  consented_at timestamptz not null default now(),
  locale text not null default 'en' check (length(locale) <= 10),
  created_at timestamptz not null default now()
);

comment on table public.waitlist is 'Website waitlist sign-ups with explicit email consent.';

alter table public.waitlist enable row level security;

-- Insert only: no select/update/delete policy exists, so the public key cannot read the list.
create policy "Anyone can join the waitlist"
  on public.waitlist
  for insert
  to anon
  with check (true);

revoke all on public.waitlist from anon, authenticated;
grant insert (email, consent_text, locale) on public.waitlist to anon;
