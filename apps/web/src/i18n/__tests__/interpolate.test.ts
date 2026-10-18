import { describe, expect, it } from 'vitest';

import { interpolate } from '..';

describe('interpolate', () => {
  it('replaces placeholders', () => {
    expect(interpolate('{{min}}–{{ max }} bpm', { min: 100, max: 120 })).toBe('100–120 bpm');
  });

  it('keeps placeholders without a value', () => {
    expect(interpolate('max {{hrMax}} bpm', { hrMax: null })).toBe('max {{hrMax}} bpm');
  });
});
