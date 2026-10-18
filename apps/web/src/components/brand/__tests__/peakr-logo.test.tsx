import { colors, lockup, mark, wordmark } from '@peakr/theme';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import BrandPage from '@/app/brand/page';

import { PeakrLogo, PeakrMark, PeakrWordmark } from '../peakr-logo';

describe('Peakr logo', () => {
  it('draws the mark with the exact geometry and a stroke of 10/120', () => {
    const { container } = render(<PeakrMark size={48} />);
    const line = container.querySelector('polyline');
    expect(line?.getAttribute('points')).toBe(mark.points);
    expect(line?.getAttribute('stroke-width')).toBe('10');
    expect(line?.getAttribute('stroke')).toBe('currentColor');
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 120 120');
  });

  it('keeps the wordmark aspect ratio', () => {
    const { container } = render(<PeakrWordmark height={wordmark.height / 2} />);
    expect(Number(container.querySelector('svg')?.getAttribute('width'))).toBeCloseTo(
      wordmark.width / 2,
    );
  });

  it('colours the lockup by tone: Volt + white on dark, Ink on light', () => {
    const dark = render(<PeakrLogo tone="onDark" height={lockup.height} />);
    expect(dark.container.querySelector('polyline')?.getAttribute('stroke')).toBe(colors.volt);
    expect(dark.container.querySelector('path')?.getAttribute('fill')).toBe(colors.white);
    expect(screen.getByRole('img', { name: 'peakr' })).toBeDefined();
    dark.unmount();

    const light = render(<PeakrLogo tone="onLight" />);
    expect(light.container.querySelector('polyline')?.getAttribute('stroke')).toBe(colors.ink);
    expect(light.container.querySelector('path')?.getAttribute('fill')).toBe(colors.ink);
  });

  it('shows every variant on the /brand page', () => {
    const { container } = render(<BrandPage />);
    expect(container.querySelectorAll('[data-logo="lockup"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-logo="mark"]').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('[data-logo="wordmark"]').length).toBeGreaterThanOrEqual(2);
  });
});
