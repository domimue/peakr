import { afterEach, describe, expect, it, vi } from 'vitest';

import robots from '@/app/robots';
import sitemap from '@/app/sitemap';

import { siteUrl } from '../site';

afterEach(() => vi.unstubAllEnvs());

describe('siteUrl', () => {
  it('prefers NEXT_PUBLIC_SITE_URL without trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://peakr.example/');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'peakr.vercel.app');
    expect(siteUrl()).toBe('https://peakr.example');
  });

  it('falls back to the Vercel production domain', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'peakr.vercel.app');
    expect(siteUrl()).toBe('https://peakr.vercel.app');
  });
});

describe('sitemap and robots', () => {
  it('lists the landing page, tools and legal pages with absolute URLs', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://peakr.example');
    expect(sitemap().map((entry) => entry.url)).toEqual([
      'https://peakr.example',
      'https://peakr.example/tools',
      'https://peakr.example/tools/heart-rate-zones',
      'https://peakr.example/tools/zone-2',
      'https://peakr.example/tools/pace',
      'https://peakr.example/tools/swim-css',
      'https://peakr.example/privacy',
      'https://peakr.example/imprint',
    ]);
  });

  it('allows crawling in production and blocks preview deployments', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://peakr.example');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'https://peakr.example/sitemap.xml',
    });
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(robots().rules).toEqual({ userAgent: '*', disallow: '/' });
  });
});
