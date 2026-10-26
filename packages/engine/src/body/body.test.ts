import { describe, expect, it } from 'vitest';

import {
  checkInChanges,
  CORE_MEASUREMENTS,
  EXTRA_MEASUREMENTS,
  measurementWarning,
  navyBodyFat,
  nextMeasureDay,
  parsePrototypeBackup,
  weightWarning,
} from '.';

describe('US Navy body fat (estimate)', () => {
  it('men: height, neck and belly at the navel', () => {
    // 180 cm, neck 39, belly 88 → ≈ 17.6 %
    expect(navyBodyFat({ sex: 'male', heightCm: 180, neckCm: 39, bellyCm: 88 })).toBeCloseTo(
      17.6,
      1,
    );
  });
  it('women: height, neck, waist and hip', () => {
    // 168 cm, neck 32, waist 72, hip 98 → ≈ 26.6 %
    expect(
      navyBodyFat({ sex: 'female', heightCm: 168, neckCm: 32, waistCm: 72, hipCm: 98 }),
    ).toBeCloseTo(26.6, 1);
  });
  it('missing or impossible values give nothing', () => {
    expect(navyBodyFat({ sex: 'female', heightCm: 168, neckCm: 32, waistCm: 72 })).toBeNull();
    expect(navyBodyFat({ sex: 'male', heightCm: 180, neckCm: 40, bellyCm: 39 })).toBeNull();
    expect(navyBodyFat({ sex: 'male', heightCm: 180, neckCm: 39 })).toBeNull();
    // Waist used when the belly is missing.
    expect(navyBodyFat({ sex: 'male', heightCm: 180, neckCm: 39, waistCm: 88 })).toBeCloseTo(
      17.6,
      1,
    );
  });
});

describe('measurement fields', () => {
  it('core fields first, the rest collapsible, each with an instruction key', () => {
    expect(CORE_MEASUREMENTS.map((m) => m.key)).toEqual(['neck', 'waist', 'belly', 'hip']);
    expect(EXTRA_MEASUREMENTS.map((m) => m.key)).toEqual([
      'chest',
      'shoulder',
      'armL',
      'armR',
      'forearm',
      'thighL',
      'thighR',
      'calfL',
      'calfR',
    ]);
  });

  it('warns about values out of range and unrealistic jumps since the last measurement', () => {
    expect(measurementWarning('waist', 20, null, '2026-10-26')).toBe('outOfRange');
    expect(
      measurementWarning('waist', 84, { value: 85, day: '2026-10-19' }, '2026-10-26'),
    ).toBeNull();
    expect(measurementWarning('waist', 80, { value: 85, day: '2026-10-19' }, '2026-10-26')).toBe(
      'jump',
    );
    // Over four weeks more change is plausible.
    expect(
      measurementWarning('waist', 81, { value: 85, day: '2026-09-28' }, '2026-10-26'),
    ).toBeNull();
    expect(measurementWarning('neck', 41, { value: 38, day: '2026-10-19' }, '2026-10-26')).toBe(
      'jump',
    );
  });

  it('weight: out of range and jumps beyond water swings', () => {
    expect(weightWarning(500, null, '2026-10-26')).toBe('outOfRange');
    expect(weightWarning(81.5, { value: 80, day: '2026-10-25' }, '2026-10-26')).toBeNull();
    expect(weightWarning(84, { value: 80, day: '2026-10-25' }, '2026-10-26')).toBe('jump');
    expect(weightWarning(76, { value: 80, day: '2026-09-26' }, '2026-10-26')).toBeNull();
  });
});

describe('edges', () => {
  it('first values have nothing to compare with; implausible results and inputs give nothing', () => {
    expect(measurementWarning('hip', 100, null, '2026-10-26')).toBeNull();
    expect(weightWarning(80, null, '2026-10-26')).toBeNull();
    expect(navyBodyFat({ sex: 'male', heightCm: 0, neckCm: 39, bellyCm: 88 })).toBeNull();
    expect(
      navyBodyFat({ sex: 'female', heightCm: 168, neckCm: 32, bellyCm: 72, hipCm: 98 }),
    ).toBeCloseTo(26.6, 1);
    // A neck almost as wide as the belly: a number far outside reality.
    expect(navyBodyFat({ sex: 'male', heightCm: 180, neckCm: 87.9, bellyCm: 88 })).toBeNull();
  });

  it('import: women, an odd day key and a sex the prototype did not know', () => {
    const r = parsePrototypeBackup({
      settings: { sex: 'f' },
      entries: [{ date: '2026-09-22', days: { nope: { in: 1 }, '2026-09-21': 'x' } }],
    });
    expect(r.ok && r.value.profile).toEqual({ sex: 'female' });
    expect(r.ok && r.value.days).toEqual([]);
    const odd = parsePrototypeBackup({ settings: { sex: 'x' }, entries: [] });
    expect(odd.ok && odd.value.profile).toEqual({});
  });
});

describe('check-in changes', () => {
  it('differences to the previous check-in, only where both have a value', () => {
    expect(
      checkInChanges(
        { weightKg: 79.2, bodyFatPct: 18.5, measurements: { waist: 84, belly: 90, hip: 99 } },
        { weightKg: 80, bodyFatPct: 19, measurements: { waist: 85.5, hip: 99, neck: 39 } },
      ),
    ).toEqual({ weightKg: -0.8, bodyFatPct: -0.5, measurements: { waist: -1.5, hip: 0 } });
    expect(checkInChanges({ weightKg: 80, bodyFatPct: null, measurements: {} }, null)).toEqual({
      weightKg: null,
      bodyFatPct: null,
      measurements: {},
    });
  });
});

describe('rhythm', () => {
  it('the next measuring day on or after today', () => {
    // 2026-10-26 is a Monday.
    expect(nextMeasureDay('2026-10-26', 1)).toBe('2026-10-26');
    expect(nextMeasureDay('2026-10-26', 0)).toBe('2026-11-01');
    expect(nextMeasureDay('2026-10-27', 1)).toBe('2026-11-02');
  });
});

describe('Körper-Tracker import', () => {
  const backup = {
    settings: { height: 180, sex: 'm', cadence: 'weekly', weekday: 1, goal: 78 },
    entries: [
      {
        date: '2026-09-29',
        weight: 82.4,
        bodyfat: 21.5,
        m: { neck: 39.5, waist: 88, belly: '91,5', hip: 101, armR: 34, calfR: 38, bogus: 3 },
        note: 'Salziger Abend',
        photos: { front: 'abc123', side: null },
        days: {
          '2026-09-23': { in: 2300, rest: 1800, active: 500 },
          '2026-09-24': { in: 2100 },
          '2026-09-25': {},
        },
      },
      { date: '2026-09-22', weight: 83.1 },
      { date: 'kaputt', weight: 1 },
      { weight: 80 },
    ],
  };

  it('maps entries, measurements, daily energy and the profile', () => {
    const r = parsePrototypeBackup(backup);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.profile).toEqual({
      heightCm: 180,
      sex: 'male',
      measureWeekday: 1,
      weighDaily: false,
      goalKg: 78,
    });
    expect(r.value.checkIns).toEqual([
      {
        day: '2026-09-22',
        weightKg: 83.1,
        bodyFatPct: null,
        measurements: {},
        note: null,
      },
      {
        day: '2026-09-29',
        weightKg: 82.4,
        bodyFatPct: 21.5,
        measurements: { neck: 39.5, waist: 88, belly: 91.5, hip: 101, armR: 34, calfR: 38 },
        note: 'Salziger Abend',
      },
    ]);
    expect(r.value.days).toEqual([
      { day: '2026-09-23', intakeKcal: 2300, activeKcal: 500 },
      { day: '2026-09-24', intakeKcal: 2100, activeKcal: null },
    ]);
    expect(r.value.skipped).toBe(2);
    expect(r.value.photosNotImported).toBe(1);
  });

  it('accepts a bare entry list and rejects anything else', () => {
    const r = parsePrototypeBackup([{ date: '2026-09-22', weight: 83.1 }]);
    expect(r.ok && r.value.checkIns).toHaveLength(1);
    expect(r.ok && r.value.profile).toEqual({});
    expect(parsePrototypeBackup({ foo: 1 }).ok).toBe(false);
    expect(parsePrototypeBackup('nope').ok).toBe(false);
  });
});
