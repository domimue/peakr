import { describe, expect, it } from 'vitest';

import { formatDuration } from './format';

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [59, '0:59'],
    [105, '1:45'],
    [1439, '23:59'],
    [3600, '1:00:00'],
    [6619, '1:50:19'],
    [13801.4, '3:50:01'],
    [299.6, '5:00'],
  ])('formats %d s as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it('rejects negative or non-finite durations', () => {
    expect(() => formatDuration(-1)).toThrow(RangeError);
    expect(() => formatDuration(Number.NaN)).toThrow(RangeError);
  });
});
