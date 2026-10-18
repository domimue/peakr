-- Waitlist for the website (Phase 1b). Full backend follows in Phase 6.
-- The website inserts with the public (anon/publishable) key; nobody can read rows with it.

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  -- Stored lower-cased so the unique constraint is case-insensitive.
  email text not null unique
    check (email = lower(email) and length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  consent boolean not null default false,
  -- Exact consent wording the visitor agreed to (GDPR / revDSG proof of consent).
  consent_text text check (length(consent_text) <= 1000),
  -- Where the sign-up came from, e.g. 'home' or a tool page.
  source text check (length(source) <= 100),
  locale text check (length(locale) <= 10),
  created_at timestamptz not null default now()
);

comment on table public.waitlist is 'Website waitlist sign-ups with explicit email consent.';

alter table public.waitlist enable row level security;

-- Insert only, and only with consent. No select/update/delete policy exists, so the public key
-- cannot read the list (inserts must therefore not ask for the row back).
create policy "Anyone can join the waitlist with consent"
  on public.waitlist
  for insert
  to anon
  with check (consent = true);

revoke all on public.waitlist from anon, authenticated;
grant insert (email, consent, consent_text, source, locale) on public.waitlist to anon;
