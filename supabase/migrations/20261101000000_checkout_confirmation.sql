-- Phase 10d: the checkout confirmation email (website, `confirmation-email.ts`) is sent once per
-- completed checkout. The website claims this column before sending, so the Stripe webhook and the
-- success page cannot both send it.

alter table public.web_checkouts add column confirmed_at timestamptz;

comment on column public.web_checkouts.confirmed_at is
  'When the checkout confirmation email (with the "Open Peakr" app link) went out.';
