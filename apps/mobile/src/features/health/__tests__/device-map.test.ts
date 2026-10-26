import {
  mapNutrition,
  localDay,
  mapDailyTotals,
  mapInstant,
  mapSleepSessions,
} from '../device-map';

const OWN = 'com.peakr.app';
/** Local wall-clock time on a day, as ISO – so the tests do not depend on the machine's zone. */
const at = (day: string, hh: number, mm = 0) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, hh, mm).toISOString();
};

describe('localDay', () => {
  it('uses the phone time zone', () => {
    expect(localDay(at('2026-10-23', 0, 30))).toBe('2026-10-23');
    expect(localDay(at('2026-10-22', 23, 59))).toBe('2026-10-22');
  });
});

describe('mapSleepSessions', () => {
  const stage = (day: string, h1: number, m1: number, h2: number, m2: number, s: number) => ({
    startTime: at(day, h1, m1),
    endTime: at(day, h2, m2),
    stage: s,
  });

  it('sums the sleep stages of the longest session ending on the wake-up day', () => {
    const night = {
      metadata: { id: 'hc-1', dataOrigin: 'com.garmin.android.apps.connectmobile' },
      startTime: at('2026-10-22', 23, 0),
      endTime: at('2026-10-23', 6, 30),
      stages: [
        { startTime: at('2026-10-22', 23, 0), endTime: at('2026-10-23', 1, 0), stage: 4 },
        stage('2026-10-23', 1, 0, 2, 30, 5),
        stage('2026-10-23', 2, 30, 2, 50, 1),
        stage('2026-10-23', 2, 50, 4, 20, 6),
        stage('2026-10-23', 4, 20, 6, 30, 2),
      ],
    };
    const nap = {
      metadata: { id: 'nap' },
      startTime: at('2026-10-23', 14, 0),
      endTime: at('2026-10-23', 14, 30),
    };
    const [v] = mapSleepSessions([nap, night], OWN);
    expect(v).toEqual({
      metric: 'sleep_duration',
      day: '2026-10-23',
      value: 120 + 90 + 90 + 130,
      detail: {
        deepMin: 90,
        lightMin: 120,
        remMin: 90,
        awakeMin: 20,
        bedTime: '23:00',
        wakeTime: '06:30',
      },
      recordedAt: night.endTime,
      sourceIds: ['hc-1'],
    });
  });

  it("uses the session length without stages and skips Peakr's own and empty records", () => {
    const plain = { startTime: at('2026-10-21', 22, 0), endTime: at('2026-10-22', 6, 0) };
    const own = {
      metadata: { dataOrigin: OWN },
      startTime: at('2026-10-20', 22, 0),
      endTime: at('2026-10-21', 6, 0),
    };
    const awakeOnly = {
      startTime: at('2026-10-19', 22, 0),
      endTime: at('2026-10-20', 6, 0),
      stages: [{ startTime: at('2026-10-19', 22, 0), endTime: at('2026-10-20', 6, 0), stage: 1 }],
    };
    const out = mapSleepSessions([plain, own, awakeOnly], OWN);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      day: '2026-10-22',
      value: 480,
      sourceIds: ['sleep-2026-10-22'],
    });
    expect(out[0]?.detail).toMatchObject({ deepMin: null, bedTime: '22:00' });
  });
});

describe('mapInstant', () => {
  const r = (day: string, h: number, value: number, id?: string) => ({
    time: at(day, h),
    value,
    ...(id ? { metadata: { id } } : {}),
  });

  it('takes the median of a day for levels and keeps every id', () => {
    const out = mapInstant(
      'resting_hr',
      [
        r('2026-10-23', 6, 52, 'a'),
        r('2026-10-23', 7, 48, 'b'),
        r('2026-10-23', 8, 50, 'c'),
        r('2026-10-22', 6, 51),
      ],
      'median',
      OWN,
    );
    expect(out.map((v) => [v.day, v.value, v.sourceIds])).toEqual([
      ['2026-10-22', 51, ['resting_hr-2026-10-22-0']],
      ['2026-10-23', 50, ['a', 'b', 'c']],
    ]);
    expect(out[1]?.recordedAt).toBe(at('2026-10-23', 8));
  });

  it('takes the latest measurement with decimals and skips invalid and own records', () => {
    const out = mapInstant(
      'weight',
      [
        r('2026-10-23', 7, 72.46),
        r('2026-10-23', 20, 73.04),
        r('2026-10-23', 21, Number.NaN),
        { ...r('2026-10-23', 22, 90), metadata: { clientRecordId: 'peakr-gym-x' } },
      ],
      'latest',
      OWN,
      1,
    );
    expect(out.map((v) => v.value)).toEqual([73]);
  });
});

describe('mapDailyTotals', () => {
  it('keeps positive daily totals from the store aggregation', () => {
    const out = mapDailyTotals(
      'steps',
      [
        { startTime: at('2026-10-23', 0), value: 9876.4 },
        { startTime: at('2026-10-22', 0), value: 0 },
      ],
      '2026-10-23T12:00:00.000Z',
    );
    expect(out).toEqual([
      {
        metric: 'steps',
        day: '2026-10-23',
        value: 9876,
        detail: null,
        recordedAt: '2026-10-23T12:00:00.000Z',
        sourceIds: ['steps-2026-10-23'],
      },
    ]);
  });
});

describe('nutrition from Health Connect', () => {
  it('sums intake per day and leaves out Peakr’s own diary entries', () => {
    expect(
      mapNutrition(
        [
          {
            startTime: '2026-10-25T07:30:00',
            kcal: 400,
            metadata: { dataOrigin: 'com.other.app' },
          },
          {
            startTime: '2026-10-25T12:00:00',
            kcal: 650.4,
            metadata: { dataOrigin: 'com.other.app' },
          },
          {
            startTime: '2026-10-25T12:00:00',
            kcal: 500,
            metadata: { dataOrigin: 'com.peakr.app' },
          },
          {
            startTime: '2026-10-25T18:00:00',
            kcal: 300,
            metadata: { clientRecordId: 'peakr-food-abc' },
          },
          { startTime: '2026-10-26T08:00:00', kcal: 0 },
        ],
        'com.peakr.app',
      ),
    ).toEqual([{ day: '2026-10-25', value: 1050 }]);
  });
});
