import { describe, expect, it } from 'vitest';

import {
  allWorkouts,
  findWorkout,
  newPlanState,
  setWorkoutStatus,
  type PlanInput,
} from '../plan/edit';
import { generatePlan } from '../plan/generate';
import { indoorVersion, treadmillSpeedKmh } from '../plan/indoor';
import type { Plan, Workout } from '../plan/types';
import {
  forecastAt,
  sessionHours,
  weatherCondition,
  weatherExposure,
  weatherHint,
  weatherMoveDays,
  weatherReasons,
} from './rules';
import type { WeatherForecast, WeatherHour } from './types';

/**
 * Weather check (CLAUDE.md "Real-life & seasonal adaptation" 4). Same base plan as
 * screens.test.ts: intermediate runner, half marathon, plan from Monday 2026-10-19. Week 2:
 * Mon 10-26 easy · Tue strength · Wed easy · Thu strength · Sat long · Sun fartlek.
 */

const input: PlanInput = {
  profile: {
    age: 35,
    experience: 'intermediate',
    sports: ['run'],
    terrain: 'flat',
    strength: { mode: 'peakr', equipment: 'gym' },
  },
  goal: { kind: 'half' },
  availability: { minutesPerDay: [60, 60, 45, 60, 0, 120, 90], doublesAllowed: false },
  targetDate: '2027-02-14',
};
const generated = generatePlan(
  input.profile,
  input.goal,
  input.availability,
  '2026-10-19',
  input.targetDate,
);
if (!generated.ok) throw new Error('plan');
const plan: Plan = generated.value;
const state = newPlanState(plan);
const MONDAY = '2026-10-26';
const easy = findWorkout(plan, `${MONDAY}-1`) as Workout;
const onDay = (date: string, sport: Workout['sport']) =>
  allWorkouts(plan).find((w) => w.date === date && w.sport === sport) as Workout;
const strength = onDay('2026-10-27', 'strength');
const long = allWorkouts(plan).find((w) => w.date >= MONDAY && w.role === 'long') as Workout;

const fine: Omit<WeatherHour, 'time'> = {
  temperatureC: 10,
  precipitationMm: 0,
  snowfallCm: 0,
  windGustKmh: 15,
  weatherCode: 1,
};

/** Fine weather on the given days, with the overrides per `date T hour`. */
function forecast(
  days: string[],
  overrides: Record<string, Partial<WeatherHour>> = {},
): WeatherForecast {
  const hours: WeatherHour[] = days.flatMap((date) =>
    Array.from({ length: 24 }, (_, h) => {
      const time = `${date}T${String(h).padStart(2, '0')}:00`;
      return { time, ...fine, ...overrides[time] };
    }),
  );
  return { provider: 'openmeteo', timezone: 'Europe/Zurich', fetchedAt: '', hours };
}

const at = (hour: number, date = MONDAY) => `${date}T${String(hour).padStart(2, '0')}:00`;
const reasons = (f: WeatherForecast, w: Workout = easy, hour = 18) =>
  weatherReasons(f, w, input.profile, hour)?.reasons ?? [];

describe('conditions for the Today chip', () => {
  it('maps WMO codes, and amounts without a code', () => {
    const h = (weatherCode: number | null, more: Partial<WeatherHour> = {}) =>
      weatherCondition({ time: '', ...fine, weatherCode, ...more });
    expect(h(0)).toBe('clear');
    expect(h(2)).toBe('partlyCloudy');
    expect(h(3)).toBe('cloudy');
    expect(h(45)).toBe('fog');
    expect(h(53)).toBe('drizzle');
    expect(h(63)).toBe('rain');
    expect(h(81)).toBe('rain');
    expect(h(66)).toBe('freezingRain');
    expect(h(73)).toBe('snow');
    expect(h(86)).toBe('snow');
    expect(h(95)).toBe('thunderstorm');
    expect(h(null, { snowfallCm: 1 })).toBe('snow');
    expect(h(null, { precipitationMm: 2 })).toBe('rain');
    expect(h(null, { precipitationMm: 0.2 })).toBe('drizzle');
    expect(h(null)).toBe('clear');
    expect(h(null, { snowfallCm: null, precipitationMm: null })).toBe('clear');
  });

  it('finds the hour of the session and the hours it covers', () => {
    const f = forecast([MONDAY]);
    expect(forecastAt(f, MONDAY, 7)?.time).toBe(at(7));
    expect(forecastAt(f, '2026-10-27', 7)).toBeNull();
    expect(sessionHours(f, MONDAY, 18, 50).map((h) => h.time)).toEqual([at(18)]);
    expect(sessionHours(f, MONDAY, 18, 61)).toHaveLength(2);
    expect(sessionHours(f, MONDAY, 23, 120)).toHaveLength(1);
  });
});

describe('which sessions the weather affects', () => {
  it('runs, rides, open water and winter sports – not strength or pool swims', () => {
    const p = input.profile;
    expect(weatherExposure(easy, p)).toBe('run');
    expect(weatherExposure({ ...easy, sport: 'bike' }, p)).toBe('bike');
    expect(weatherExposure({ ...easy, sport: 'brick' }, p)).toBe('bike');
    expect(weatherExposure({ ...easy, sport: 'walk' }, p)).toBe('run');
    expect(weatherExposure({ ...easy, sport: 'xcski' }, p)).toBe('winter');
    expect(weatherExposure(strength, p)).toBeNull();
    expect(weatherExposure({ ...easy, sport: 'swim', templateId: 'swim.css' }, p)).toBeNull();
    expect(weatherExposure({ ...easy, sport: 'swim', templateId: 'swim.openwater' }, p)).toBe(
      'swim',
    );
    expect(
      weatherExposure(
        { ...easy, sport: 'swim', templateId: 'swim.css' },
        { ...p, poolLength: 'openwater' },
      ),
    ).toBe('swim');
  });
});

describe('thresholds at the session time', () => {
  it('fine weather and light rain give no hint', () => {
    expect(weatherReasons(forecast([MONDAY]), easy, input.profile, 18)).toBeNull();
    expect(
      reasons(forecast([MONDAY], { [at(18)]: { precipitationMm: 1.5, weatherCode: 61 } })),
    ).toEqual([]);
  });

  it('heavy rain per hour, by code, or over the whole session', () => {
    const f = forecast([MONDAY], { [at(18)]: { precipitationMm: 5, weatherCode: 63 } });
    expect(weatherReasons(f, easy, input.profile, 18)).toEqual({
      reasons: ['heavyRain'],
      from: at(18),
    });
    expect(
      reasons(forecast([MONDAY], { [at(18)]: { precipitationMm: 2, weatherCode: 65 } })),
    ).toEqual(['heavyRain']);
    // 3 mm/h stays below 4 mm/h for a run, but 2 hours × 3 mm … still below 8 mm in total.
    const steady = { precipitationMm: 3, weatherCode: 61 };
    const twoHours = { ...easy, durationMin: 120 };
    expect(reasons(forecast([MONDAY], { [at(18)]: steady, [at(19)]: steady }), twoHours)).toEqual(
      [],
    );
    // … three hours × 3 mm are 9 mm.
    const threeHours = { ...easy, durationMin: 150 };
    const wet = { [at(18)]: steady, [at(19)]: steady, [at(20)]: steady };
    expect(reasons(forecast([MONDAY], wet), threeHours)).toEqual(['heavyRain']);
    // The bike is stricter: 3 mm/h is already heavy rain on the road.
    expect(reasons(forecast([MONDAY], { [at(18)]: steady }), { ...easy, sport: 'bike' })).toEqual([
      'heavyRain',
    ]);
  });

  it('rain outside the session time does not count', () => {
    const f = forecast([MONDAY], { [at(14)]: { precipitationMm: 9, weatherCode: 65 } });
    expect(reasons(f)).toEqual([]);
    expect(reasons(f, easy, 14)).toEqual(['heavyRain']);
  });

  it('snowfall: real snow for a run, any snow on the bike, none for winter sports', () => {
    const light = { snowfallCm: 0.4, precipitationMm: 0.3, temperatureC: -1, weatherCode: 71 };
    expect(reasons(forecast([MONDAY], { [at(18)]: light }))).toEqual([]);
    expect(reasons(forecast([MONDAY], { [at(18)]: light }), { ...easy, sport: 'bike' })).toEqual([
      'snow',
    ]);
    const heavy = { snowfallCm: 2, precipitationMm: 1.4, temperatureC: -2, weatherCode: 75 };
    expect(reasons(forecast([MONDAY], { [at(18)]: heavy }))).toEqual(['snow']);
    expect(reasons(forecast([MONDAY], { [at(18)]: heavy }), { ...easy, sport: 'xcski' })).toEqual(
      [],
    );
  });

  it('ice: freezing rain, rain at 0 °C, or black ice after rain', () => {
    expect(
      reasons(forecast([MONDAY], { [at(18)]: { weatherCode: 67, precipitationMm: 0.5 } })),
    ).toEqual(['ice']);
    expect(
      reasons(
        forecast([MONDAY], {
          [at(18)]: { temperatureC: 0, precipitationMm: 0.3, weatherCode: 61 },
        }),
      ),
    ).toEqual(['ice']);
    const blackIce = forecast([MONDAY], {
      [at(14)]: { temperatureC: 3, precipitationMm: 1, weatherCode: 61 },
      [at(18)]: { temperatureC: -1, weatherCode: 3 },
    });
    expect(reasons(blackIce)).toEqual(['ice']);
    // Rain long before (more than 6 hours) and dry cold: no ice.
    const dryCold = forecast([MONDAY], {
      [at(9)]: { temperatureC: 3, precipitationMm: 1, weatherCode: 61 },
      [at(18)]: { temperatureC: -1, weatherCode: 3 },
    });
    expect(reasons(dryCold)).toEqual([]);
    // Ice is for the road: an open-water swim does not care.
    const ow = { ...easy, sport: 'swim' as const, templateId: 'swim.openwater' };
    expect(reasons(blackIce, ow)).toEqual([]);
  });

  it('storm gusts per sport, thunderstorms for everyone, most severe first', () => {
    const gusty = forecast([MONDAY], { [at(18)]: { windGustKmh: 55 } });
    expect(reasons(gusty)).toEqual([]);
    expect(reasons(gusty, { ...easy, sport: 'bike' })).toEqual(['storm']);
    const storm = forecast([MONDAY], {
      [at(18)]: { windGustKmh: 80, precipitationMm: 6, weatherCode: 95 },
    });
    expect(reasons(storm)).toEqual(['thunderstorm', 'storm', 'heavyRain']);
    const ow = { ...easy, sport: 'swim' as const, templateId: 'swim.openwater' };
    expect(reasons(storm, ow)).toEqual(['thunderstorm', 'storm']);
  });

  it('missing values count as nothing', () => {
    const empty = {
      temperatureC: null,
      precipitationMm: null,
      snowfallCm: null,
      windGustKmh: null,
      weatherCode: null,
    };
    expect(reasons(forecast([MONDAY], { [at(18)]: empty }))).toEqual([]);
  });

  it('no hint when the forecast does not reach the session or it is not outdoors', () => {
    const f = forecast(['2026-10-25'], { [at(18, '2026-10-25')]: { weatherCode: 95 } });
    expect(weatherReasons(f, easy, input.profile, 18)).toBeNull();
    const storm = forecast([MONDAY], { [at(18)]: { weatherCode: 95 } });
    expect(weatherReasons(storm, { ...strength, date: MONDAY }, input.profile, 18)).toBeNull();
  });
});

describe('the hint and its options', () => {
  const rainy = (date: string) =>
    forecast([date], { [at(18, date)]: { precipitationMm: 6, weatherCode: 65 } });

  it('easy run: treadmill first, then move', () => {
    expect(weatherHint(rainy(MONDAY), state, easy, input.profile, 18)).toEqual({
      workoutId: easy.id,
      reasons: ['heavyRain'],
      from: at(18),
      actions: ['indoor', 'move'],
    });
  });

  it('long run over 90 min: moving comes first, the treadmill is a poor substitute', () => {
    const longRun = { ...long, durationMin: 100 };
    const hint = weatherHint(rainy(long.date), state, longRun, input.profile, 18);
    expect(hint?.actions).toEqual(['move', 'indoor']);
  });

  it('sessions without an indoor version can only be moved', () => {
    const noIndoor = { ...easy, indoorAlternativeId: null };
    expect(weatherHint(rainy(MONDAY), state, noIndoor, input.profile, 18)?.actions).toEqual([
      'move',
    ]);
  });

  it('commutes can only be skipped; done sessions get no hint', () => {
    const commute = { ...easy, role: 'commute' as const };
    expect(weatherHint(rainy(MONDAY), state, commute, input.profile, 18)?.actions).toEqual([
      'skip',
    ]);
    const done = setWorkoutStatus(state, easy.id, 'done');
    if (!done.ok) throw new Error('status');
    expect(weatherHint(rainy(MONDAY), done.value, easy, input.profile, 18)).toBeNull();
  });

  it('uses the default session hour (18:00) when none is given', () => {
    expect(weatherHint(rainy(MONDAY), state, easy, input.profile)).not.toBeNull();
    expect(weatherHint(rainy(MONDAY), state, easy, input.profile, 7)).toBeNull();
  });

  it('suggests other days without broken rules or bad weather, nearest first', () => {
    // Every day of this plan is taken or has no time (Friday): nothing to suggest.
    expect(weatherMoveDays(state, easy.id, input, '2026-10-25', null, 18)).toEqual([]);
    // With Fridays free, both Fridays around the session qualify – the nearer one first.
    const minutesPerDay: [number, number, number, number, number, number, number] = [
      60, 60, 45, 60, 60, 120, 90,
    ];
    const freeFriday = { ...input, availability: { ...input.availability, minutesPerDay } };
    const days = weatherMoveDays(state, easy.id, freeFriday, '2026-10-25', null, 18);
    expect(days).toEqual(['2026-10-30', '2026-11-06']);
    // Bad weather on the first suggestion removes it.
    const stormy = forecast(['2026-10-30'], { [at(18, '2026-10-30')]: { weatherCode: 95 } });
    expect(weatherMoveDays(state, easy.id, freeFriday, '2026-10-25', stormy, 18)).toEqual([
      '2026-11-06',
    ]);
    // Days up to today are never offered.
    expect(weatherMoveDays(state, easy.id, freeFriday, '2026-10-30', null, 18)).toEqual([
      '2026-11-06',
    ]);
    expect(weatherMoveDays(state, 'nope', input, '2026-10-25', null)).toEqual([]);
    // Skipped sessions free their days; at most three suggestions.
    let skipped = state;
    for (const id of [`2026-10-28-1`, '2026-11-01-1', '2026-11-04-1']) {
      const r = setWorkoutStatus(skipped, id, 'skipped');
      if (!r.ok) throw new Error('skip');
      skipped = r.value;
    }
    const three = weatherMoveDays(skipped, easy.id, freeFriday, '2026-10-25', null, 18);
    // Wednesdays have 45 min, too short for this 60-min run.
    expect(three).toEqual(['2026-10-30', '2026-11-01', '2026-11-06']);
  });
});

describe('indoor versions adapted to indoors', () => {
  it('treadmill: incline, heat note, same load; reps get the ramp-up note', () => {
    const v = indoorVersion(easy);
    expect(v).toMatchObject({
      kind: 'treadmill',
      inclinePct: 1,
      load: easy.load,
      preferMove: false,
    });
    expect(v?.notes.map((n) => n.key)).toEqual(['indoorNotes.treadmillHeat']);
    const rep = {
      durationSec: 180,
      zone: 5 as const,
      target: { kind: 'paceZone' as const, value: 'I' },
    };
    const intervals: Workout = {
      ...easy,
      type: 'intervals',
      main: [{ repeat: 5, steps: [rep, { ...rep, zone: 1, rest: true }] }],
    };
    expect(indoorVersion(intervals)?.notes.map((n) => n.key)).toContain(
      'indoorNotes.treadmillRamp',
    );
  });

  it('treadmill: long runs may be split, descents cannot be replicated', () => {
    const v = indoorVersion({ ...easy, durationMin: 80 });
    expect(v?.notes.map((n) => n.key)).toContain('indoorNotes.treadmillSplit');
    expect(v?.preferMove).toBe(false);
    const downhill = indoorVersion({
      ...easy,
      terrain: { gainPerKm: 30, distanceKm: 10, expectedGainM: 300, eccentric: true },
    });
    expect(downhill?.notes.map((n) => n.key)).toContain('indoorNotes.treadmillNoDescent');
    expect(downhill?.preferMove).toBe(true);
  });

  it('trainer: rides over 90 min are capped from their easy part and count denser', () => {
    const z2 = (min: number) => ({
      durationSec: min * 60,
      zone: 2 as const,
      target: { kind: 'hrZone' as const, value: 'Z2' },
    });
    const ride: Workout = {
      ...easy,
      sport: 'bike',
      indoorAlternativeId: 'indoor.trainer',
      durationMin: 150,
      load: 225,
      warmup: [z2(10)],
      main: [{ repeat: 1, steps: [z2(130)] }],
      cooldown: [z2(10)],
    };
    const v = indoorVersion(ride);
    expect(v?.durationMin).toBe(90);
    expect(v?.main[0]?.steps[0]?.durationSec).toBe(70 * 60);
    // 90 indoor min × 1.2 = 108 of 150 outdoor min → 72 % of the load.
    expect(v?.load).toBeCloseTo(162, 0);
    expect(v?.preferMove).toBe(true);
    expect(v?.notes.find((n) => n.key === 'indoorNotes.trainerCapped')?.params).toEqual({
      outdoor: 150,
      indoor: 90,
    });
    const short = indoorVersion({
      ...ride,
      durationMin: 60,
      main: [{ repeat: 1, steps: [z2(40)] }],
    });
    expect(short).toMatchObject({ durationMin: 60, load: 225, preferMove: false });
  });

  it('trainer: reps and distance steps are never cut; rides of reps only keep their time', () => {
    const step = (min: number, zone: 2 | 4) => ({
      durationSec: min * 60,
      zone,
      target: { kind: 'hrZone' as const, value: `Z${zone}` },
    });
    const base: Workout = {
      ...easy,
      sport: 'bike',
      indoorAlternativeId: 'indoor.trainer',
      durationMin: 120,
      load: 200,
      warmup: [],
      cooldown: [],
    };
    const distance = {
      distanceM: 1000,
      zone: 2 as const,
      target: { kind: 'hrZone' as const, value: 'Z2' },
    };
    const mixed = indoorVersion({
      ...base,
      main: [
        { repeat: 1, steps: [step(80, 2), distance] },
        { repeat: 4, steps: [step(10, 4)] },
      ],
    });
    expect(mixed?.main[0]?.steps).toEqual([step(50, 2), distance]);
    expect(mixed?.main[1]).toEqual({ repeat: 4, steps: [step(10, 4)] });
    const repsOnly = indoorVersion({ ...base, main: [{ repeat: 12, steps: [step(10, 4)] }] });
    expect(repsOnly?.durationMin).toBe(120);
    expect(repsOnly?.load).toBe(200);
  });

  it('open water → pool notes the missing sighting; pace → treadmill speed', () => {
    const ow = indoorVersion({
      ...easy,
      sport: 'swim',
      templateId: 'swim.openwater',
      indoorAlternativeId: 'indoor.pool',
    });
    expect(ow?.notes.map((n) => n.key)).toEqual(['indoorNotes.poolOpenWater']);
    expect(treadmillSpeedKmh(300)).toBe(12);
    expect(treadmillSpeedKmh(270)).toBe(13.3);
  });
});
