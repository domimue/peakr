import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { metadata as deleteAccountMetadata } from '@/app/delete-account/page';
import FeaturesPage, { metadata as featuresMetadata } from '@/app/features/page';
import { metadata as imprintMetadata } from '@/app/imprint/page';
import { metadata as pricingMetadata } from '@/app/pricing/page';
import { metadata as privacyMetadata } from '@/app/privacy/page';
import { metadata as termsMetadata } from '@/app/terms/page';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

import { PUBLIC_PAGES } from '../site';

const pages = [
  ['/features', featuresMetadata],
  ['/pricing', pricingMetadata],
  ['/privacy', privacyMetadata],
  ['/terms', termsMetadata],
  ['/imprint', imprintMetadata],
  ['/delete-account', deleteAccountMetadata],
] as const;

describe('public pages', () => {
  it.each(pages)('%s has its own canonical URL and is in the sitemap', (path, metadata) => {
    expect(metadata.alternates?.canonical).toBe(path);
    expect(PUBLIC_PAGES.map((page) => page.path)).toContain(path);
  });

  it('every page has a unique title and description', () => {
    const titles = pages.map(([, metadata]) => JSON.stringify(metadata.title));
    const descriptions = pages.map(([, metadata]) => metadata.description);
    expect(new Set(titles).size).toBe(pages.length);
    expect(new Set(descriptions).size).toBe(pages.length);
  });

  it('features page shows every section and sends the CTA to the quiz', () => {
    render(<FeaturesPage />);
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
    for (const heading of [
      'One hybrid plan',
      'Heart rate zones first',
      'Terrain intelligence',
      'Calendar & real life',
      'Integrations',
      'Nutrition & body add-on',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeDefined();
    }
    for (const name of ['Strava', 'Garmin', 'COROS', 'Suunto', 'Apple Watch', 'Zwift']) {
      expect(screen.getByText(name)).toBeDefined();
    }
    expect(screen.getAllByRole('img', { name: 'Screenshot coming soon' })).toHaveLength(5);
    expect(
      screen.getByRole('link', { name: 'Build your personal plan' }).getAttribute('href'),
    ).toBe('/quiz');
  });

  it('header links the main pages and the footer links every public page', () => {
    render(
      <>
        <SiteHeader />
        <SiteFooter />
      </>,
    );
    const hrefs = (name: string) =>
      Array.from(screen.getByRole('navigation', { name }).querySelectorAll('a')).map((link) =>
        link.getAttribute('href'),
      );
    expect(hrefs('Main navigation')).toEqual([
      '/',
      '/features',
      '/pricing',
      '/tools',
      '/account',
      '/quiz',
    ]);
    expect(hrefs('Footer')).toEqual([
      '/features',
      '/pricing',
      '/tools',
      '/privacy',
      '/terms',
      '/imprint',
      '/delete-account',
    ]);
  });
});
