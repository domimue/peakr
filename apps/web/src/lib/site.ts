import { TOOLS } from '@/features/tools/tools';

/** Absolute origin of the site without trailing slash – for canonical links, sitemap and OG. */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  // Set automatically on Vercel: the production domain (custom domain once connected).
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:3000';
}

/** Every public, indexable page – the sitemap is generated from this list. */
export const PUBLIC_PAGES: readonly { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/features', priority: 0.9 },
  { path: '/pricing', priority: 0.9 },
  { path: '/tools', priority: 0.8 },
  ...TOOLS.map((tool) => ({ path: tool.href, priority: 0.8 })),
  { path: '/get-app', priority: 0.5 },
  { path: '/privacy', priority: 0.2 },
  { path: '/terms', priority: 0.2 },
  { path: '/imprint', priority: 0.2 },
  { path: '/delete-account', priority: 0.2 },
];

/** Date shown on the privacy policy; update together with its text. */
export const PRIVACY_UPDATED = '2026-10-24';

/** Date shown on the terms of service; update together with their text. */
export const TERMS_UPDATED = '2026-10-20';

/** Shown in the footer. A constant, so pages stay fully static. */
export const COPYRIGHT_YEAR = 2026;
