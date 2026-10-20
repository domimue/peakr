import type { StoredPlanInput } from '@/data/db/schema';

import { planHrZones, resolveTrainingZones, validateOverride } from '../resolve';
import {
  emptyOverrides,
  withZoneSettings,
  zoneSettingsOf,
  type TrainingZoneSettings,
} from '../settings';

const base: TrainingZoneSettings = { hrMethod: null, overrides: emptyOverrides() };

const input: StoredPlanInput = {
  profile: {
    age: 30,
    experience: 'intermediate',
    sports: ['run'],
    terrain: 'flat',
    strength: { mode: 'none' },
  },
  goal: { kind: 'half' },
  availability: { minutesPerDay: [60, 60, 45, 60, 0, 120, 90], doublesAllowed: false },
  targetDate: '2027-02-14',
  hrZones: { age: 30, restingHr: 60 },
};

describe('resolveTrainingZones', () => {
  it('returns null for disciplines without input', () => {
    expect(resolveTrainingZones(base)).toEqual({ hr: null, run: null, swim: null });
  });

  it('uses the engine default method and applies a single HR override', () => {
    const zones = resolveTrainingZones({
      ...base,
      age: 30,
      restingHr: 60,
      overrides: { ...emptyOverrides(), hr: { 2: { minBpm: 130, maxBpm: 145 } } },
    });
    if (!zones.hr?.ok) throw new Error('expected HR zones');
    expect(zones.hr.value.method).toBe('karvonen');
    expect(zones.hr.value.zones[1]).toEqual({ zone: 2, minBpm: 130, maxBpm: 145, custom: true });
    expect(zones.hr.value.zones[2]).toMatchObject({ zone: 3, custom: false });
  });

  it('derives run and swim pace zones', () => {
    const zones = resolveTrainingZones({
      ...base,
      runReference: { distance: '10k', timeSec: 3000 },
      swimTest: { time400Sec: 400, time200Sec: 190 },
      overrides: { ...emptyOverrides(), swimPace: { 5: { slowestSec: 100, fastestSec: 90 } } },
    });
    expect(zones.run?.ok && zones.run.value.paceZones).toHaveLength(5);
    if (!zones.swim?.ok) throw new Error('expected swim zones');
    expect(zones.swim.value.cssPacePer100mSec).toBe(105);
    expect(zones.swim.value.zones[4]).toEqual({
      zone: 5,
      slowestSec: 100,
      fastestSec: 90,
      custom: true,
    });
  });

  it('passes engine issues through', () => {
    const zones = resolveTrainingZones({ ...base, hrMethod: 'karvonen', age: 30 });
    expect(zones.hr).toEqual({
      ok: false,
      issues: [{ field: 'restingHr', code: 'required' }],
    });
  });
});

describe('stored with the plan input', () => {
  it('reads the onboarding heart-rate input of plans stored before Training zones existed', () => {
    expect(zoneSettingsOf(input)).toEqual({
      hrMethod: null,
      age: 30,
      hrMax: undefined,
      restingHr: 60,
      lthr: undefined,
      overrides: emptyOverrides(),
    });
  });

  it('round-trips and sets threshold pace and CSS for the plan', () => {
    const settings: TrainingZoneSettings = {
      ...zoneSettingsOf(input),
      hrMethod: 'percentMax',
      runReference: { distance: '10k', timeSec: 3000 },
      overrides: { ...emptyOverrides(), hr: { 2: { minBpm: 125, maxBpm: 140 } } },
    };
    const next = withZoneSettings(input, settings, { thresholdPaceSecPerKm: 290 });
    expect(next.hrZones).toEqual({ method: 'percentMax', age: 30, restingHr: 60 });
    expect(next.profile.thresholdPaceSecPerKm).toBe(290);
    expect(next.profile.cssPacePer100mSec).toBeUndefined();
    expect(zoneSettingsOf(next)).toEqual({ ...settings, hrMax: undefined, lthr: undefined });
    // The manual zone reaches every bpm target of the plan.
    expect(planHrZones(next)[1]).toEqual({ zone: 2, minBpm: 125, maxBpm: 140 });
  });

  it('has no zones without heart-rate input', () => {
    expect(planHrZones(undefined)).toEqual([]);
    expect(planHrZones({ ...input, hrZones: undefined })).toEqual([]);
  });
});

describe('validateOverride', () => {
  it('accepts a plausible range', () => {
    expect(validateOverride('hr', { minBpm: 120, maxBpm: 140 })).toBeUndefined();
    expect(validateOverride('runPace', { slowestSec: 330, fastestSec: 300 })).toBeUndefined();
  });

  it('rejects reversed or implausible ranges', () => {
    expect(validateOverride('hr', { minBpm: 150, maxBpm: 140 })).toBe('hrOrder');
    expect(validateOverride('hr', { minBpm: 10, maxBpm: 140 })).toBe('outOfRange');
    expect(validateOverride('swimPace', { slowestSec: 90, fastestSec: 100 })).toBe('paceOrder');
  });
});
