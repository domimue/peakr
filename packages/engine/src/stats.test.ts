import { describe, expect, it } from 'vitest';

import { mad, median, quantile, theilSen, trimmedMean } from './stats';

describe('stats', () => {
  it('returns null for empty input', () => {
    expect(median([])).toBeNull();
    expect(quantile([], 0.3)).toBeNull();
    expect(trimmedMean([])).toBeNull();
    expect(mad([])).toBeNull();
    expect(theilSen([])).toBeNull();
  });

  it('median and quantiles interpolate', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
    expect(quantile([5, 1, 9], 1)).toBe(9);
  });

  it('trimmed mean ignores the extremes', () => {
    expect(trimmedMean([1, 2, 3, 4, 100], 0.2)).toBe(3);
    expect(trimmedMean([7], 0.4)).toBe(7);
    expect(trimmedMean([1, 3], 0.5)).toBe(2);
  });

  it('MAD is robust against one outlier', () => {
    expect(mad([1, 2, 3, 4, 1000])).toBe(1);
  });

  it('Theil–Sen ignores a single outlier', () => {
    const points = [1, 2, 3, 4, 5].map((x) => ({ x, y: 2 * x + 1 }));
    const fit = theilSen([...points, { x: 6, y: -100 }]);
    expect(fit?.slope).toBe(2);
    expect(fit?.intercept).toBe(1);
    expect(
      theilSen([
        { x: 1, y: 1 },
        { x: 1, y: 2 },
      ]),
    ).toBeNull();
  });
});
