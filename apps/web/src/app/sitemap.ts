import type { MetadataRoute } from 'next';

import { PUBLIC_PAGES, siteUrl } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteUrl();
  return PUBLIC_PAGES.map(({ path, priority }) => ({
    url: `${origin}${path === '/' ? '' : path}`,
    changeFrequency: 'monthly',
    priority,
  }));
}
