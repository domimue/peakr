import { describe, expect, it } from 'vitest';

import { calculateHrZones, type HrZone } from '../hr';
import { generatePlan } from '../plan/generate';
import { gainPaceFactor } from '../plan/terrain';
import type { Availability, Plan, UserProfile } from '../plan/types';
import {
  calibrateHrInput,
  calibrateProfile,
  deriveBaseline,
  effectiveHrInput,
  suggestSelection,
  type BaselineActivity,
  type BaselineResult,
} from './index';

const TODAY = '2026-10-20'; // Tuesday; the 60-day window starts on 2026-08-22
const MONDAYS = ['08-24', '08-31', '09-07', '09-14', '09-21', '09-28', '10-05', '10-12'].map(
  (d) => `2026-${d}`,
);

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

let seq = 0;
function act(
  partial: Partial<BaselineActivity> & Pick<BaselineActivity, 'date'>,
): BaselineActivity {
  return {
    externalId: String(++seq),
    sport: 'run',
    durationSec: 50 * 60,
    distanceM: 8000,
    elevationGainM: 20,
    avgHr: 140,
    maxHr: 170,
    indoor: false,
    manual: false,
    race: false,
    best20MinHr: null,
    ...partial,
  };
}

/** Three runs a week for eight weeks: two 50-minute runs and a 90-minute long run. */
function typicalRunner(): BaselineActivity[] {
  return MONDAYS.flatMap((monday) => [
    act({ date: monday }),
    act({ date: addDays(monday, 2) }),
    act({ date: addDays(monday, 5), durationSec: 90 * 60, distanceM: 14000 }),
  ]);
}

const derive = (acts: BaselineActivity[], zones: HrZone[] = []) =>
  deriveBaseline(acts, { today: TODAY, age: 40, hrZones: zones });

const zonesFor = (hrMax: number) => {
  const r = calculateHrZones({ hrMax });
  if (!r.ok) throw new Error('zones');
  return r.value.zones;
};

describe('deriveBaseline – volume and level', () => {
  it('derives weekly volume, frequency, longest session and level per sport', () => {
    const r = derive(typicalRunner());
    expect(r.weeks).toBe(8);
    const run = r.sports.find((s) => s.sport === 'run');
    expect(run?.volume).toEqual({
      status: 'ok',
      count: 24,
      value: {
        weeklyMin: 190,
        weeklyKm: 30,
        sessionsPerWeek: 3,
        longestMin: 90,
        longMin: 90,
        longKm: 14,
        longSessions: 6,
        recentWeeklyMin: 190,
        recentWeeklyKm: 30,
      },
    });
    expect(run?.experience).toMatchObject({ status: 'ok', value: 'intermediate' });
    expect(r.sports.find((s) => s.sport === 'swim')?.volume.status).toBe('notEnoughData');
  });

  it('reports "not enough data" below the minimum instead of a number', () => {
    const r = derive([act({ date: MONDAYS[0] as string }), act({ date: MONDAYS[3] as string })]);
    expect(r.sports[0]?.volume).toEqual({ status: 'notEnoughData', count: 2, needed: 3 });
    expect(r.sports[0]?.experience.status).toBe('notEnoughData');
    expect(r.weeklyLoad.status).toBe('notEnoughData');
    expect(r.easyPaceSecPerKm).toEqual({ status: 'notEnoughData', count: 2, needed: 4 });
  });

  it('never reads activities older than 60 days or in the future', () => {
    const r = derive([
      ...typicalRunner(),
      act({ date: '2026-08-21', durationSec: 5 * 3600 }),
      act({ date: '2026-10-21', durationSec: 5 * 3600 }),
    ]);
    expect(r.activities).toBe(24);
    expect(r.sports[0]?.volume).toMatchObject({ value: { longestMin: 90 } });
  });

  it('counts treadmill, manual and HR-less sessions for volume', () => {
    const acts = typicalRunner().map((a, i) =>
      i % 3 === 0 ? { ...a, indoor: true, manual: i % 2 === 0, avgHr: null } : a,
    );
    expect(derive(acts).sports[0]?.volume).toMatchObject({ count: 24, value: { weeklyMin: 190 } });
  });

  it('classifies a high-volume runner as advanced', () => {
    const acts = MONDAYS.flatMap((m) =>
      [0, 1, 2, 3, 5].map((d) =>
        act({ date: addDays(m, d), durationSec: (d === 5 ? 100 : 50) * 60 }),
      ),
    );
    expect(derive(acts).sports[0]?.experience).toMatchObject({ value: 'advanced' });
  });
});

describe('deriveBaseline – terrain and paces', () => {
  it('learns the usual terrain from outdoor activities only', () => {
    const acts: BaselineActivity[] = typicalRunner().map((a) => ({
      ...a,
      elevationGainM: (a.distanceM ?? 0) / 50,
    }));
    acts.push(act({ date: MONDAYS[1] as string, indoor: true, elevationGainM: 2000 }));
    expect(derive(acts).sports[0]?.terrain).toMatchObject({
      status: 'ok',
      count: 24,
      value: { gainPerKm: 20, terrain: 'hilly' },
    });
  });

  it('grade-adjusts paces: hilly runs do not make the user look slower', () => {
    const flatPace = 360;
    const flat = MONDAYS.slice(0, 4).map((m) =>
      act({ date: m, distanceM: 10000, elevationGainM: 0, durationSec: flatPace * 10 }),
    );
    const hilly = MONDAYS.slice(0, 4).map((m) =>
      act({
        date: m,
        distanceM: 10000,
        elevationGainM: 300,
        durationSec: Math.round(flatPace * gainPaceFactor(30) * 10),
      }),
    );
    expect(gainPaceFactor(30)).toBeGreaterThan(1.02);
    expect(derive(flat).easyPaceSecPerKm).toMatchObject({ value: flatPace });
    expect(derive(hilly).easyPaceSecPerKm).toMatchObject({ value: flatPace });
  });

  it('easy pace uses runs at or below the top of Zone 2', () => {
    const zones = zonesFor(190);
    const acts = [
      ...MONDAYS.slice(0, 4).map((m) =>
        act({ date: m, avgHr: 120, durationSec: 3000, distanceM: 8000 }),
      ),
      ...MONDAYS.slice(4).map((m) =>
        act({ date: m, avgHr: 170, durationSec: 2400, distanceM: 8000 }),
      ),
    ];
    expect(derive(acts, zones).easyPaceSecPerKm).toEqual({ status: 'ok', value: 375, count: 4 });
  });

  it('without HR the slowest third of the runs count as easy', () => {
    const paces = [300, 310, 320, 330, 340, 350, 400, 410, 420];
    const acts = paces.map((p, i) =>
      act({
        date: addDays(MONDAYS[0] as string, i),
        avgHr: null,
        elevationGainM: 0,
        durationSec: p * 8,
      }),
    );
    expect(derive(acts).easyPaceSecPerKm).toEqual({ status: 'ok', value: 410, count: 3 });
  });

  it('leaves treadmill, manual and race runs out of the paces', () => {
    const acts = [
      ...MONDAYS.slice(0, 3).map((m) => act({ date: m, elevationGainM: 0, durationSec: 3000 })),
      act({ date: MONDAYS[4] as string, indoor: true }),
      act({ date: MONDAYS[5] as string, manual: true }),
      act({ date: MONDAYS[6] as string, race: true }),
    ];
    expect(derive(acts).easyPaceSecPerKm).toEqual({ status: 'notEnoughData', count: 3, needed: 4 });
  });

  it('fits the pace–HR relation and evaluates it at the top of Zone 2', () => {
    const acts = [130, 140, 150, 160, 170].map((hr, i) =>
      act({
        date: addDays(MONDAYS[1] as string, i),
        avgHr: hr,
        elevationGainM: 0,
        distanceM: 10000,
        durationSec: (400 - (hr - 130) * 2) * 10,
      }),
    );
    const r = derive(acts, zonesFor(190));
    expect(r.paceHr).toMatchObject({ status: 'ok', count: 5, value: { slopeSecPerKmPerBpm: -2 } });
    if (r.paceHr.status !== 'ok') return;
    const { referenceHr, paceAtReferenceSecPerKm } = r.paceHr.value;
    expect(paceAtReferenceSecPerKm).toBe(400 - (referenceHr - 130) * 2);
  });

  it('reports no pace–HR relation when pace does not get faster with HR', () => {
    const acts = [130, 140, 150, 160].map((hr, i) =>
      act({ date: addDays(MONDAYS[1] as string, i), avgHr: hr, durationSec: 3000 + i * 100 }),
    );
    expect(derive(acts).paceHr.status).toBe('notEnoughData');
  });
});

describe('deriveBaseline – heart rate and swimming', () => {
  it('HRmax is the second highest observed value; manual entries do not count', () => {
    const acts = [182, 190, 186, 205].map((maxHr, i) =>
      act({ date: addDays(MONDAYS[2] as string, i), maxHr }),
    );
    acts.push(act({ date: MONDAYS[3] as string, maxHr: 220, manual: true }));
    expect(derive(acts).hrMax).toEqual({ status: 'ok', value: 190, count: 4 });
    expect(derive(acts.slice(0, 2)).hrMax.status).toBe('notEnoughData');
  });

  it('LTHR: 95 % of the best 20 minutes of hard runs', () => {
    const acts = [
      ...[188, 190, 186].map((maxHr, i) => act({ date: addDays(MONDAYS[0] as string, i), maxHr })),
      act({ date: MONDAYS[1] as string, best20MinHr: 176 }),
      act({ date: MONDAYS[2] as string, best20MinHr: 172 }),
      act({ date: MONDAYS[3] as string, best20MinHr: 140 }), // easy run: not an effort
    ];
    // estimates 167.2 and 163.4 → median 165.3
    expect(derive(acts).lthr).toEqual({ status: 'ok', value: 165, count: 2 });
  });

  it('LTHR falls back to hard 20–60 minute efforts, then to rides', () => {
    const hardRuns = [0, 1].map((i) =>
      act({ date: addDays(MONDAYS[4] as string, i), durationSec: 30 * 60, avgHr: 168 }),
    );
    expect(derive(hardRuns).lthr).toMatchObject({ status: 'ok', value: 168 });
    const rides = hardRuns.map((a) => ({ ...a, sport: 'bike' as const, avgHr: 160 }));
    expect(derive(rides).lthr).toMatchObject({ status: 'ok', value: 160 });
    const easy = hardRuns.map((a) => ({ ...a, avgHr: 130 }));
    expect(derive(easy).lthr.status).toBe('notEnoughData');
  });

  it('estimates CSS from the fastest swims', () => {
    const swims = [
      { distanceM: 1500, durationSec: 2400 },
      { distanceM: 1000, durationSec: 1500 },
      { distanceM: 2000, durationSec: 3300 },
      { distanceM: 300, durationSec: 300 }, // too short
    ].map((s, i) => act({ ...s, sport: 'swim', date: addDays(MONDAYS[5] as string, i) }));
    expect(derive(swims).cssPacePer100mSec).toEqual({ status: 'ok', value: 146, count: 3 });
    expect(derive(swims.slice(0, 2)).cssPacePer100mSec.status).toBe('notEnoughData');
  });

  it('Strava zones the user set take precedence for classifying easy runs', () => {
    const acts = MONDAYS.slice(0, 4).map((m) => act({ date: m, avgHr: 158 }));
    const quizZones = zonesFor(190); // 158 is above Z2 here
    const strava: HrZone[] = [
      { zone: 1, minBpm: null, maxBpm: 140 },
      { zone: 2, minBpm: 141, maxBpm: 160 },
      { zone: 3, minBpm: 161, maxBpm: 170 },
      { zone: 4, minBpm: 171, maxBpm: 180 },
      { zone: 5, minBpm: 181, maxBpm: null },
    ];
    const r = deriveBaseline(acts, {
      today: TODAY,
      age: 40,
      hrZones: quizZones,
      stravaHrZones: strava,
    });
    expect(r.stravaHrZones).toEqual(strava);
    expect(r.easyPaceSecPerKm).toMatchObject({ status: 'ok', count: 4 });
  });

  it('derives the current weekly load from the last four full weeks', () => {
    const r = derive(typicalRunner());
    expect(r.weeklyLoad.status).toBe('ok');
    if (r.weeklyLoad.status === 'ok') expect(r.weeklyLoad.value).toBeGreaterThan(300);
  });
});

describe('suggestSelection', () => {
  it('unticks races and sessions far longer than the rest, with a reason', () => {
    const acts = [
      ...typicalRunner().slice(0, 6),
      act({ date: MONDAYS[6] as string, race: true }),
      act({ date: MONDAYS[6] as string, durationSec: 4 * 3600 }),
      act({ date: MONDAYS[7] as string, avgHr: 185 }), // hard, but kept: LTHR needs hard efforts
    ];
    const s = suggestSelection(acts);
    expect(s.slice(0, 6).every((x) => x.selected && x.reason === null)).toBe(true);
    expect(s.slice(6).map((x) => [x.selected, x.reason])).toEqual([
      [false, 'race'],
      [false, 'muchLonger'],
      [true, null],
    ]);
  });

  it('flags nothing but races with too few activities of a sport', () => {
    const s = suggestSelection([act({ date: TODAY, durationSec: 10 * 3600 })]);
    expect(s[0]).toMatchObject({ selected: true, reason: null });
  });
});

// ---------------------------------------------------------------------------------------------
// Applying the calibration

const runner: UserProfile = {
  age: 40,
  experience: 'intermediate',
  sports: ['run'],
  terrain: 'rolling',
  strength: { mode: 'none' },
};
const availability: Availability = {
  minutesPerDay: [60, 60, 45, 60, 0, 120, 90],
  doublesAllowed: false,
};

function plan(profile: UserProfile): Plan {
  const r = generatePlan(profile, { kind: 'half' }, availability, '2026-10-26', '2027-03-28');
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

function resultWith(partial: Partial<BaselineResult>): BaselineResult {
  return { ...derive(typicalRunner()), ...partial };
}

describe('calibrateProfile', () => {
  it('stores derived values in the baseline, for the selected sports only', () => {
    const r = derive([
      ...typicalRunner(),
      ...MONDAYS.flatMap((m) => [1, 3].map((d) => act({ date: addDays(m, d), sport: 'bike' }))),
    ]);
    const p = calibrateProfile(runner, r);
    expect(p.baseline?.experience).toEqual({ run: 'intermediate' });
    expect(p.baseline?.longMin).toEqual({ run: 90 });
    expect(p.baseline?.startLoad).toBe((r.weeklyLoad as { value: number }).value);
    expect(p.baseline?.thresholdPaceSecPerKm).toBeGreaterThan(0);
    expect(p.thresholdPaceSecPerKm).toBeUndefined();
  });

  it('the user’s own entries win over derived values', () => {
    const r = derive(typicalRunner());
    const own = { ...runner, thresholdPaceSecPerKm: 300 };
    const p = calibrateProfile(own, r, {
      experience: { run: 'advanced' },
      weeklyLoad: 123,
      longMin: { run: 75 },
    });
    expect(p.thresholdPaceSecPerKm).toBe(300);
    expect(p.baseline).toMatchObject({
      experience: { run: 'advanced' },
      startLoad: 123,
      longMin: { run: 75 },
    });
    const typed = calibrateProfile(own, r, { easyPaceSecPerKm: 380, cssPacePer100mSec: 110 });
    expect(typed.thresholdPaceSecPerKm).toBe(Math.round(380 / 1.215));
    expect(typed.cssPacePer100mSec).toBe(110);
  });

  it('a recalibration replaces the previous baseline and leaves the input untouched', () => {
    const first = calibrateProfile(runner, derive(typicalRunner()));
    const frozen = JSON.stringify(first);
    const empty = calibrateProfile(first, derive([]));
    expect(empty.baseline).toBeUndefined();
    expect(JSON.stringify(first)).toBe(frozen);
  });

  it('keeps an observed HRmax only above the age estimate; user HR entries win', () => {
    const low = calibrateProfile(
      runner,
      resultWith({ hrMax: { status: 'ok', value: 170, count: 5 } }),
    );
    expect(low.baseline?.hrMax).toBeUndefined(); // 208 − 0.7 × 40 = 180
    const high = calibrateProfile(
      runner,
      resultWith({
        hrMax: { status: 'ok', value: 192, count: 5 },
        lthr: { status: 'ok', value: 171, count: 2 },
      }),
    );
    expect(high.baseline).toMatchObject({ hrMax: 192, lthr: 171 });
    expect(effectiveHrInput({ age: 40 }, high.baseline)).toEqual({
      age: 40,
      hrMax: 192,
      lthr: 171,
    });
    expect(effectiveHrInput({ age: 40, hrMax: 185 }, high.baseline)).toMatchObject({ hrMax: 185 });
    expect(calibrateHrInput({ age: 40, hrMax: 185 }, { hrMax: 195 })).toMatchObject({ hrMax: 195 });
  });
});

describe('generatePlan with a baseline', () => {
  const firstWeek = (p: Plan) => p.weeks[0] as Plan['weeks'][number];

  it('week 1 starts at the current weekly load, within the capacity', () => {
    const quiz = firstWeek(plan(runner)).targetLoad;
    const low = firstWeek(plan({ ...runner, baseline: { startLoad: 1 } })).targetLoad;
    const high = firstWeek(plan({ ...runner, baseline: { startLoad: 100_000 } })).targetLoad;
    const mid = firstWeek(plan({ ...runner, baseline: { startLoad: quiz * 1.1 } })).targetLoad;
    expect(low).toBeLessThan(quiz); // beginner share of the capacity
    expect(low).toBeGreaterThan(1);
    expect(high).toBeGreaterThan(mid);
    expect(mid).toBeCloseTo(quiz * 1.1, 0);
  });

  it('the per-sport level class sets the start level of that sport', () => {
    const levels = (p: Plan) =>
      p.weeks
        .slice(0, 3)
        .flatMap((wk) => wk.workouts)
        .flatMap((w) =>
          w.sport === 'run' && w.level !== null && !w.templateId.startsWith('bench')
            ? [w.level]
            : [],
        );
    const beginner = levels(plan({ ...runner, baseline: { experience: { run: 'beginner' } } }));
    const advanced = levels(plan({ ...runner, baseline: { experience: { run: 'advanced' } } }));
    expect(Math.max(...advanced)).toBeGreaterThan(Math.max(...beginner));
  });

  it('the long session starts at the usual long session', () => {
    const long = (p: Plan) => firstWeek(p).workouts.find((w) => w.role === 'long')?.durationMin;
    expect(long(plan({ ...runner, baseline: { longMin: { run: 85 } } }))).toBe(85);
  });

  it('uses the derived threshold pace unless the user entered one', () => {
    const easyLimit = (p: Plan) =>
      JSON.stringify(p.weeks.slice(0, 3).flatMap((wk) => wk.workouts.map((w) => w.main)));
    const base = { ...runner, baseline: { thresholdPaceSecPerKm: 280 } };
    expect(easyLimit(plan(base))).not.toBe(easyLimit(plan(runner)));
    expect(easyLimit(plan({ ...base, thresholdPaceSecPerKm: 315 }))).toBe(
      easyLimit(plan({ ...runner, thresholdPaceSecPerKm: 315 })),
    );
  });
});

describe('deriveBaseline – edge cases', () => {
  it('rejects an invalid date', () => {
    expect(() => deriveBaseline([], { today: 'soon', age: 40, hrZones: [] })).toThrow(RangeError);
  });

  it('skips the partial week at the start of the window', () => {
    const acts = [act({ date: '2026-08-22' }), ...typicalRunner()];
    expect(derive(acts).weeks).toBe(8);
  });

  it('a long session without distance (trainer) has no long distance', () => {
    const rides = MONDAYS.flatMap((m) => [
      act({ date: m, sport: 'bike', durationSec: 60 * 60, distanceM: null }),
      act({ date: addDays(m, 5), sport: 'bike', durationSec: 180 * 60, distanceM: null }),
    ]);
    const v = derive(rides).sports.find((s) => s.sport === 'bike')?.volume;
    expect(v?.status === 'ok' && [v.value.longMin, v.value.longKm]).toEqual([180, null]);
  });

  it('copes with missing distance and elevation', () => {
    const acts = typicalRunner().map((a, i) =>
      i % 3 === 1 ? { ...a, distanceM: null } : i % 3 === 2 ? { ...a, elevationGainM: null } : a,
    );
    const swims = [0, 1, 2].map((i) =>
      act({ date: addDays(TODAY, -(i % 2)), sport: 'swim', distanceM: null }),
    );
    const r = derive([...acts, ...swims]);
    expect(r.sports[0]?.volume.status).toBe('ok');
    expect(r.sports[0]?.terrain).toMatchObject({ count: 8 });
    expect(r.easyPaceSecPerKm.status).toBe('ok');
    expect(r.cssPacePer100mSec.status).toBe('notEnoughData');
    // all swims are in the current, not yet full week: no typical long swim
    const swim = r.sports.find((s) => s.sport === 'swim');
    expect(swim?.volume).toMatchObject({ status: 'ok', value: { longMin: 0, weeklyMin: 0 } });
    expect(calibrateProfile({ ...runner, sports: ['run', 'swim'] }, r).baseline?.longMin).toEqual({
      run: 90,
    });
  });

  it('pace–HR without zones is evaluated at the median HR', () => {
    const acts = [130, 140, 150, 160, 170].map((hr, i) =>
      act({
        date: addDays(MONDAYS[1] as string, i),
        avgHr: hr,
        elevationGainM: 0,
        distanceM: 10000,
        durationSec: (400 - (hr - 130) * 2) * 10,
      }),
    );
    expect(derive(acts).paceHr).toMatchObject({
      value: { referenceHr: 150, paceAtReferenceSecPerKm: 360 },
    });
  });

  it('rejects implausible HR values', () => {
    const low = [0, 1, 2].map((i) => act({ date: addDays(MONDAYS[2] as string, i), maxHr: 95 }));
    expect(derive(low).hrMax.status).toBe('notEnoughData');
    const lowMax = [0, 1, 2].map((i) =>
      act({ date: addDays(MONDAYS[2] as string, i), maxHr: 101, avgHr: 88, durationSec: 1800 }),
    );
    expect(derive(lowMax).lthr.status).toBe('notEnoughData');
  });

  it('keeps a derived LTHR without an observed HRmax', () => {
    const p = calibrateProfile(
      runner,
      resultWith({ lthr: { status: 'ok', value: 165, count: 2 } }),
    );
    expect(p.baseline?.lthr).toBe(165);
    expect(effectiveHrInput({ age: 40 }, undefined)).toEqual({ age: 40 });
  });
});
