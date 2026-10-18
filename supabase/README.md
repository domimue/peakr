# Supabase

Minimal setup for the website waitlist (Phase 1b). Auth, sync and Edge Functions follow in Phase 6.

## One-time setup

1. Create a project at <https://supabase.com/dashboard> (free plan is enough; pick an EU region,
   e.g. Frankfurt or Zurich, to keep personal data in Europe).
2. Link this repo and apply the migrations with the Supabase CLI (a dev dependency of the
   workspace root, config in `supabase/config.toml`). The project ref is the part before
   `.supabase.co` in the project URL (also under **Project Settings → General → Project ID**):

   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <your-project-ref>
   pnpm exec supabase db push
   ```

   New schema changes go into a new file: `pnpm exec supabase migration new <name>`. Never edit
   a migration that has already been pushed.

3. In **Project Settings → API keys** copy the project URL and the **publishable** (anon) key into
   `apps/web/.env.local` (see `apps/web/.env.example`) and into the Vercel project settings.
   Never use the secret / service-role key on the website.

## Reading the waitlist

The public key can only insert. Read or export sign-ups in the dashboard (**Table Editor →
waitlist**, or `select * from waitlist order by created_at` in the SQL Editor). To honour a
deletion request: `delete from waitlist where email = lower('person@example.com');`
