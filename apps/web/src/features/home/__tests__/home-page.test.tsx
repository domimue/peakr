import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Home from '@/app/page';

describe('landing page', () => {
  it('shows the positioning, sends the main CTA into the quiz and links every tool', () => {
    render(<Home />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'One training plan for running, cycling, swimming and strength.',
      }),
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Build my plan' }).getAttribute('href')).toBe('/quiz');
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/tools/heart-rate-zones',
        '/tools/zone-2',
        '/tools/pace',
        '/tools/swim-css',
      ]),
    );
  });
});
