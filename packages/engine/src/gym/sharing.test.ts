import { describe, expect, it } from 'vitest';

import { estimateStrengthKcal } from './energy';
import {
  DEFAULT_SHARE_SETTINGS,
  defaultChoice,
  gymRecordId,
  isOwnHealthRecord,
  parseShareSettings,
  pollDelaySec,
} from './sharing';

describe('sharing', () => {
  it('shares nothing by default', () => {
    expect(defaultChoice(DEFAULT_SHARE_SETTINGS)).toEqual({ strava: false, health: false });
    expect(parseShareSettings(null)).toEqual(DEFAULT_SHARE_SETTINGS);
    expect(parseShareSettings({ strava: 'yes', health: 1 })).toEqual(DEFAULT_SHARE_SETTINGS);
    expect(parseShareSettings({ strava: true })).toEqual({ strava: true, health: false });
  });

  it('recognises records Peakr wrote itself', () => {
    expect(isOwnHealthRecord({ clientRecordId: gymRecordId('s1') }, 'com.peakr.app')).toBe(true);
    expect(isOwnHealthRecord({ dataOrigin: 'com.peakr.app' }, 'com.peakr.app')).toBe(true);
    expect(isOwnHealthRecord({ dataOrigin: 'com.garmin.android' }, 'com.peakr.app')).toBe(false);
    expect(isOwnHealthRecord({}, 'com.peakr.app')).toBe(false);
  });

  it('polls no faster than once a second and backs off', () => {
    const delays = Array.from({ length: 8 }, (_, i) => pollDelaySec(i));
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(1);
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
  });

  it('estimates energy from duration and effort', () => {
    expect(estimateStrengthKcal(60, { rpe: 8, bodyWeightKg: 80 })).toBe(480);
    expect(estimateStrengthKcal(60, { rpe: 3, bodyWeightKg: 80 })).toBe(280);
    expect(estimateStrengthKcal(0)).toBe(0);
    expect(estimateStrengthKcal(45)).toBeGreaterThan(0);
  });
});
