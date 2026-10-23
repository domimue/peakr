import { describe, expect, it } from 'vitest';

import {
  baselineBand,
  computeBaseline,
  computeTrend,
  deviationFrom,
  HEALTH_METRICS,
  healthConfig,
  METRIC_GROUP,
  metricsOfGroup,
  recoverySignal,
  resolveDaily,
  type HealthRecord,
  type SeriesPoint,
} from './index';

const TODAY = '2026-10-23';

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** `values[0]` is the day before `end`, `values[1]` two days before, … (null = gap). */
function history(end: string, values: readonly (number | null)[]): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  values.forEach((v, i) => {
    if (v !== null) out.push({ day: addDays(end, -(i + 1)), value: v });
  });
  return out;
}

/** A gently wobbling series around `center` (deterministic). */
function steady(center: number, wobble: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => center + ((i % 5) - 2) * (wobble / 2));
}

describe('metric groups', () => {
  it('assigns every metric to exactly one group and lists them back', () => {
    for (const m of HEALTH_METRICS) expect(metricsOfGroup(METRIC_GROUP[m])).toContain(m);
    expect(metricsOfGroup('womens_health')).toEqual([]);
  });
});

describe('resolveDaily', () => {
  const rec = (p: Partial<HealthRecord>): HealthRecord => ({
    metric: 'resting_hr',
    day: TODAY,
    value: 50,
    source: 'garmin',
    sourceId: 'g1',
    recordedAt: `${TODAY}T07:00:00Z`,
    ...p,
  });

  it('prefers Garmin over Health Connect and keeps every source id', () => {
    const [v] = resolveDaily([
      rec({
        source: 'healthConnect',
        sourceId: 'hc1',
        value: 52,
        recordedAt: `${TODAY}T09:00:00Z`,
      }),
      rec({ value: 49 }),
    ]);
    expect(v).toMatchObject({ value: 49, source: 'garmin' });
    expect(v?.sourceIds).toEqual([
      { source: 'healthConnect', id: 'hc1' },
      { source: 'garmin', id: 'g1' },
    ]);
  });

  it('within one source takes the latest recording and drops non-finite values', () => {
    const out = resolveDaily([
      rec({ value: 48, sourceId: 'a', recordedAt: `${TODAY}T06:00:00Z` }),
      rec({ value: 51, sourceId: 'b', recordedAt: `${TODAY}T08:00:00Z` }),
      rec({ value: Number.NaN, sourceId: 'c', recordedAt: `${TODAY}T09:00:00Z` }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.value).toBe(51);
    expect(out[0]?.sourceIds.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('breaks a tie on the same recording time by source id', () => {
    const out = resolveDaily([
      rec({ value: 47, sourceId: 'z' }),
      rec({ value: 46, sourceId: 'm' }),
      rec({ value: 45, sourceId: 'm' }),
    ]);
    expect(out[0]?.value).toBe(46);
    expect(out[0]?.sourceIds.map((s) => s.id)).toEqual(['z', 'm']);
  });

  it('keeps metrics and days apart, sorted', () => {
    const out = resolveDaily([
      rec({ day: addDays(TODAY, -1) }),
      rec({ metric: 'steps', value: 9000 }),
      rec({}),
    ]);
    expect(out.map((v) => `${v.metric}@${v.day}`)).toEqual([
      `resting_hr@${addDays(TODAY, -1)}`,
      `resting_hr@${TODAY}`,
      `steps@${TODAY}`,
    ]);
  });
});

describe('computeBaseline', () => {
  it('says "not enough data" below the minimum number of days', () => {
    const b = computeBaseline('resting_hr', history(TODAY, steady(50, 2, 13)), TODAY, 30);
    expect(b).toEqual({ status: 'insufficient', window: 30, n: 13, needed: 14 });
    expect(
      computeBaseline('resting_hr', history(TODAY, steady(50, 2, 29)), TODAY, 90),
    ).toMatchObject({ status: 'insufficient', needed: 30 });
  });

  it('builds median and band from the days before, not from today', () => {
    const series = [...history(TODAY, steady(50, 2, 30)), { day: TODAY, value: 90 }];
    const b = computeBaseline('resting_hr', series, TODAY, 30);
    expect(b.status).toBe('ok');
    if (b.status !== 'ok') return;
    expect(b.median).toBe(50);
    expect(b.n).toBe(30);
    expect(b.low).toBeLessThan(50);
    expect(b.high).toBeGreaterThan(50);
  });

  it('ignores days outside the window', () => {
    const series = [
      ...history(TODAY, steady(50, 2, 30)),
      ...history(addDays(TODAY, -30), steady(70, 2, 60)),
    ];
    const b30 = computeBaseline('resting_hr', series, TODAY, 30);
    const b90 = computeBaseline('resting_hr', series, TODAY, 90);
    expect(b30.status === 'ok' && b30.median).toBe(50);
    expect(b90.status === 'ok' && b90.median).toBeGreaterThan(65);
  });

  it('is robust against outliers and gaps', () => {
    const values: (number | null)[] = steady(50, 2, 30);
    values[3] = 80; // sick-ish night
    values[7] = 20; // strap glitch
    values[10] = null;
    values[11] = null;
    const b = computeBaseline('resting_hr', history(TODAY, values), TODAY, 30);
    expect(b.status === 'ok' && b.median).toBe(50);
    expect(b.status === 'ok' && b.high).toBeLessThan(55);
  });

  it('uses the minimum scale when the history is perfectly flat', () => {
    const b = computeBaseline('resting_hr', history(TODAY, Array(20).fill(50)), TODAY, 30);
    expect(b.status === 'ok' && b.scale).toBe(healthConfig.minScale.resting_hr);
  });

  it('counts one value per day', () => {
    const series = [...history(TODAY, steady(50, 2, 10)), ...history(TODAY, steady(50, 2, 10))];
    expect(computeBaseline('resting_hr', series, TODAY).status).toBe('insufficient');
  });

  it('rejects an invalid day', () => {
    expect(() => computeBaseline('resting_hr', [], '2026-02-30')).toThrow();
  });
});

describe('deviationFrom', () => {
  const b = computeBaseline('resting_hr', history(TODAY, Array(30).fill(50)), TODAY);
  if (b.status !== 'ok') throw new Error('baseline expected');

  it('classifies within, slightly and clearly off with a direction', () => {
    expect(deviationFrom(51, b)).toMatchObject({ level: 'within', direction: null, delta: 1 });
    expect(deviationFrom(53, b)).toMatchObject({ level: 'slightly_off', direction: 'above' });
    expect(deviationFrom(46, b)).toMatchObject({ level: 'clearly_off', direction: 'below' });
  });
});

describe('computeTrend', () => {
  it('detects a recent rise against the 30 days before', () => {
    const series = [
      ...history(addDays(TODAY, 1), Array(7).fill(56)),
      ...history(addDays(TODAY, -6), steady(50, 2, 30)),
    ];
    const t = computeTrend('resting_hr', series, TODAY);
    expect(t).toMatchObject({
      status: 'ok',
      direction: 'up',
      recentMedian: 56,
      baselineMedian: 50,
    });
    expect(t.status === 'ok' && t.slopePerWeek).toBeGreaterThan(0);
  });

  it('detects a drop and skips invalid or old days in the fit', () => {
    const series = [
      { day: 'not-a-day', value: 10 },
      ...history(addDays(TODAY, 1), Array(7).fill(48)),
      ...history(addDays(TODAY, -6), steady(60, 4, 40)),
    ];
    const t = computeTrend('hrv_night', series, TODAY);
    expect(t).toMatchObject({ status: 'ok', direction: 'down' });
    expect(t.status === 'ok' && t.slopePerWeek).toBeLessThan(0);
  });

  it('is flat within the noise and insufficient with few recent values', () => {
    const series = history(addDays(TODAY, 1), steady(50, 2, 40));
    expect(computeTrend('resting_hr', series, TODAY)).toMatchObject({ direction: 'flat' });
    const sparse = history(addDays(TODAY, -6), steady(50, 2, 30)).concat({ day: TODAY, value: 50 });
    expect(computeTrend('resting_hr', sparse, TODAY)).toEqual({ status: 'insufficient' });
  });
});

describe('baselineBand', () => {
  it('returns one band point per day with enough history and leaves gaps otherwise', () => {
    const series = history(TODAY, steady(60, 4, 20));
    const band = baselineBand('hrv_night', series, addDays(TODAY, -10), TODAY);
    // The window before day −10 only has 10 values; from day −6 on there are ≥ 14.
    expect(band.map((p) => p.day)[0]).toBe(addDays(TODAY, -6));
    expect(band.at(-1)?.day).toBe(TODAY);
    for (const p of band) expect(p.low).toBeLessThan(p.high);
  });
});

describe('recoverySignal', () => {
  const base = {
    resting_hr: history(TODAY, steady(50, 2, 30)),
    hrv_night: history(TODAY, steady(60, 4, 30)),
    sleep_duration: history(TODAY, steady(450, 20, 30)),
  };
  const withToday = (today: Partial<Record<keyof typeof base, number>>) =>
    Object.fromEntries(
      Object.entries(base).map(([m, s]) => {
        const v = today[m as keyof typeof base];
        return [m, v === undefined ? s : [...s, { day: TODAY, value: v }]];
      }),
    );

  it('is normal when everything is within the baseline', () => {
    const s = recoverySignal(
      withToday({ resting_hr: 50, hrv_night: 61, sleep_duration: 440 }),
      TODAY,
    );
    expect(s).toMatchObject({ status: 'ok', level: 'normal', reasons: [], suggestEasier: false });
  });

  it('ignores deviations in the harmless direction', () => {
    const s = recoverySignal(
      withToday({ resting_hr: 44, hrv_night: 80, sleep_duration: 560 }),
      TODAY,
    );
    expect(s).toMatchObject({ level: 'normal', reasons: [] });
  });

  it('is slightly off with one mild reading and clearly off with a strong one', () => {
    const mild = recoverySignal(
      withToday({ resting_hr: 53, hrv_night: 60, sleep_duration: 450 }),
      TODAY,
    );
    expect(mild).toMatchObject({ level: 'slightly_off', suggestEasier: false });
    const strong = recoverySignal(
      withToday({ resting_hr: 58, hrv_night: 60, sleep_duration: 450 }),
      TODAY,
    );
    expect(strong).toMatchObject({ level: 'clearly_off', suggestEasier: true });
    expect(strong.status === 'ok' && strong.reasons[0]).toEqual({
      metric: 'resting_hr',
      level: 'clearly_off',
      direction: 'above',
      amount: 8,
    });
  });

  it('is clearly off when two readings are mildly off together, worst first', () => {
    const s = recoverySignal(
      withToday({ resting_hr: 53, hrv_night: 51, sleep_duration: 450 }),
      TODAY,
    );
    expect(s).toMatchObject({ level: 'clearly_off' });
    expect(s.status === 'ok' && s.reasons.map((r) => r.metric)).toEqual([
      'hrv_night',
      'resting_hr',
    ]);
  });

  it('reports missing inputs and never invents them', () => {
    const s = recoverySignal(withToday({ resting_hr: 50 }), TODAY);
    expect(s).toMatchObject({
      status: 'ok',
      used: ['resting_hr'],
      missing: ['hrv_night', 'sleep_duration'],
    });
    expect(recoverySignal({}, TODAY)).toEqual({
      status: 'insufficient',
      missing: ['resting_hr', 'hrv_night', 'sleep_duration'],
    });
  });
});
