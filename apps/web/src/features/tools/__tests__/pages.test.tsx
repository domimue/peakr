import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HeartRateZonesPage from '@/app/tools/heart-rate-zones/page';
import ToolsIndexPage from '@/app/tools/page';
import PacePage from '@/app/tools/pace/page';
import SwimCssPage from '@/app/tools/swim-css/page';
import Zone2Page from '@/app/tools/zone-2/page';

describe('tool pages', () => {
  it('lists every calculator and the quiz CTA on the index page', () => {
    render(<ToolsIndexPage />);
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual([
      '/tools/heart-rate-zones',
      '/tools/zone-2',
      '/tools/pace',
      '/tools/swim-css',
      '/quiz',
    ]);
  });

  it.each([
    ['Heart rate zones', HeartRateZonesPage, 'What are heart rate zones?'],
    ['Zone 2 calculator', Zone2Page, 'Why Zone 2 matters'],
    ['Pace & race predictor', PacePage, 'How are race times predicted?'],
    ['Swim pace (CSS)', SwimCssPage, 'How to do the CSS test'],
  ])('%s page has a heading, explanatory text and the quiz CTA', (title, Page, heading) => {
    render(<Page />);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeDefined();
    expect(screen.getByRole('heading', { level: 2, name: heading })).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Build your personal plan' }).getAttribute('href'),
    ).toBe('/quiz');
  });
});
