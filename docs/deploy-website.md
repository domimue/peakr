# Deploying the website (Vercel + own domain)

The website in `apps/web` is a Next.js app inside the pnpm monorepo. Every page is prerendered
as static HTML. The only server code is the waitlist Server Action, which writes to Supabase.

## 1. Supabase (once)

Follow [`supabase/README.md`](../supabase/README.md): create the project in an EU region, run the
waitlist migration, and copy the project URL and the **publishable** key.

## 2. Create the Vercel project

1. Push the branch to GitHub and sign in at <https://vercel.com> with GitHub.
2. **Add New → Project**, then import the `peakr` repository.
3. Configure the project:
   - **Framework preset:** Next.js (detected automatically)
   - **Root Directory:** `apps/web`. Leave "Include files outside the root directory" switched
     on, because the site imports `packages/engine` and `packages/i18n`.
   - **Install / Build command:** keep the defaults. Vercel finds `pnpm-lock.yaml` in the repo root.
   - **Node.js version** (Settings → Build and Deployment): 22.x or newer.
4. **Environment variables** (Settings → Environment Variables):

   | Name                        | Value                                   | Environments        |
   | --------------------------- | --------------------------------------- | ------------------- |
   | `SUPABASE_URL`              | `https://<project-ref>.supabase.co`     | Production, Preview |
   | `SUPABASE_PUBLISHABLE_KEY`  | `sb_publishable_…` (or the legacy anon key) | Production, Preview |
   | `NEXT_PUBLIC_SITE_URL`      | `https://your-domain.ch` (after step 3) | Production          |
   | `ENABLE_EXPERIMENTAL_COREPACK` | `1`                                  | all                 |

   `ENABLE_EXPERIMENTAL_COREPACK=1` makes Vercel use the exact pnpm version from the root
   `package.json` (`packageManager` field) instead of its own default version.

5. **Deploy.** Every push to `main` then deploys to production, and every other branch or PR gets
   its own preview URL. Preview deployments send `Disallow: /` in `robots.txt`, so search engines
   don't index them.

Without `NEXT_PUBLIC_SITE_URL`, canonical links, the sitemap and the Open Graph images use the
Vercel production domain (`VERCEL_PROJECT_PRODUCTION_URL`). That's fine for a first test.

## 3. Connect your own domain

1. In the Vercel project go to **Settings → Domains** and add your domain, e.g. `peakr.ch`. Add
   `www.peakr.ch` too and let Vercel redirect one to the other (usually `www` → apex).
2. Vercel then shows the DNS records it needs. Create them at your domain registrar, using
   **exactly the values Vercel displays**:
   - apex (`peakr.ch`): an **A** record, typically `76.76.21.21`
   - `www`: a **CNAME** record pointing to the target Vercel shows, e.g. `cname.vercel-dns.com`

   Alternatively, switch the domain's nameservers to Vercel. Then Vercel manages all records
   itself. Only do this if no email or other services depend on the current DNS, or recreate
   their records (MX, SPF, …) in Vercel first.
3. Wait until Vercel shows **Valid Configuration**. Usually that takes minutes, at most 48 hours.
   Vercel issues the HTTPS certificate automatically.
4. Set `NEXT_PUBLIC_SITE_URL=https://peakr.ch` for Production and **redeploy**
   (Deployments → … → Redeploy). The value is built into the canonical links, `sitemap.xml` and
   the OG image URLs.
5. Submit `https://peakr.ch/sitemap.xml` in Google Search Console (verify the domain with a DNS
   TXT record).

## Checks after the first deployment

- `https://peakr.ch/robots.txt` allows crawling and points to the sitemap.
- `https://peakr.ch/sitemap.xml` lists 8 URLs on your domain.
- Paste the URL into a social card preview (e.g. <https://www.opengraph.xyz>). It should show
  the dark Peakr card.
- Join the waitlist with your own address and check that the row appears in Supabase
  (**Table Editor → waitlist**).

## Before going public

- Fill in the operator details in `packages/i18n/src/locales/en/web.json` → `legal.operator`
  (name, address, contact email). They are placeholders right now, and Swiss law requires them
  in the legal notice.
- Have the privacy policy text reviewed. It assumes an EU Supabase region and no analytics.
