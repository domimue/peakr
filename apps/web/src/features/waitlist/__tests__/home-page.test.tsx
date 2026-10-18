import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../actions', () => ({ joinWaitlist: vi.fn() }));

const { default: Home } = await import('@/app/page');

describe('landing page', () => {
  it('shows the positioning, the waitlist and links to every tool', () => {
    render(<Home />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'One training plan for running, cycling, swimming and strength.',
      }),
    ).toBeDefined();
    expect(screen.getByRole('heading', { level: 2, name: 'Join the waitlist' })).toBeDefined();
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
