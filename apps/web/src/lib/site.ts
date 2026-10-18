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
  { path: '/tools', priority: 0.8 },
  ...TOOLS.map((tool) => ({ path: tool.href, priority: 0.8 })),
  { path: '/privacy', priority: 0.2 },
  { path: '/imprint', priority: 0.2 },
];

/** Date shown on the privacy policy; update together with its text. */
export const PRIVACY_UPDATED = '2026-10-18';

/** Shown in the footer. A constant, so pages stay fully static. */
export const COPYRIGHT_YEAR = 2026;
