import { colors, lockup, wordmark } from '@peakr/theme';
import { render, screen } from '@testing-library/react-native';

import { BrandScreen } from '@/features/dev/brand-screen';

import { PeakrLogo, PeakrMark, PeakrWordmark } from '../brand/peakr-logo';

describe('Peakr logo', () => {
  it('renders the mark at the requested size with the exact geometry', async () => {
    await render(<PeakrMark size={48} color={colors.volt} accessibilityLabel="peakr" />);
    const svg = screen.getByTestId('peakr-mark');
    expect(svg.props.width).toBe(48);
    expect(svg.props.height).toBe(48);
  });

  it('keeps the wordmark aspect ratio', async () => {
    await render(<PeakrWordmark height={wordmark.height / 2} color={colors.ink} />);
    const svg = screen.getByTestId('peakr-wordmark');
    expect(svg.props.width).toBeCloseTo(wordmark.width / 2);
  });

  it('renders the lockup with the lockup proportions', async () => {
    await render(<PeakrLogo tone="onDark" height={lockup.height} />);
    expect(screen.getByTestId('peakr-lockup').props.width).toBeCloseTo(lockup.width);
    expect(screen.getByLabelText('peakr')).toBeOnTheScreen();
  });

  it.each(['mark', 'wordmark'] as const)('renders the %s variant', async (variant) => {
    await render(<PeakrLogo variant={variant} tone="onLight" />);
    expect(screen.getByTestId(`peakr-${variant}`)).toBeOnTheScreen();
  });

  it('shows every variant on the dev brand screen', async () => {
    await render(<BrandScreen />);
    expect(screen.getAllByTestId('peakr-lockup')).toHaveLength(2);
    expect(screen.getByText('Heart-rate zones')).toBeOnTheScreen();
  });
});
