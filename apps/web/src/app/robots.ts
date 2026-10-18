import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  // Only the production deployment is indexed; Vercel preview deployments stay out of search.
  const isProduction = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'production';
  return {
    rules: isProduction ? { userAgent: '*', allow: '/' } : { userAgent: '*', disallow: '/' },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
