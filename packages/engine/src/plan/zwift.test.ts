import { describe, expect, it } from 'vitest';

import { dedupeActivities, type SourceActivity } from './activities';
import { allWorkouts } from './edit';
import { generatePlan } from './generate';
import type { Availability, Sport, Step, Workout } from './types';
import { buildZwo } from './zwift';

const availability: Availability = {
  minutesPerDay: [60, 60, 60, 60, 60, 120, 90],
  doublesAllowed: false,
};

function workouts(sport: Sport, goal: 'granfondo' | 'half' | 'swim'): Workout[] {
  const r = generatePlan(
    {
      age: 35,
      experience: 'intermediate',
      sports: [sport],
      terrain: 'flat',
      strength: { mode: 'none' },
    },
    { kind: goal },
    availability,
    '2026-10-19',
    '2027-04-18',
  );
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return allWorkouts(r.value);
}

const rides = workouts('bike', 'granfondo').filter((w) => w.sport === 'bike');
const runs = workouts('run', 'half').filter((w) => w.sport === 'run');
const ride = rides.find((w) => w.main.some((b) => b.repeat > 1)) as Workout;

const hrStep = (durationSec: number, zone: 1 | 2 | 3 | 4 | 5, extra: Partial<Step> = {}): Step => ({
  durationSec,
  zone,
  target: { kind: 'hrZone', value: `Z${zone}` },
  ...extra,
});

const bare = (w: Workout, main: Workout['main']): Workout => ({
  ...w,
  warmup: [],
  cooldown: [],
  main,
});

describe('buildZwo bike', () => {
  it('produces a workout file under 64 KB', () => {
    const result = buildZwo(ride, { name: 'Sweet spot <3 & "co"' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { xml, sizeBytes, fileName, sport } = result.file;
    expect(sport).toBe('bike');
    expect(xml.startsWith('<?xml version="1.0"')).toBe(true);
    expect(xml).toContain('<sportType>bike</sportType>');
    expect(xml).toContain('<name>Sweet spot &lt;3 &amp; &quot;co&quot;</name>');
    expect(xml).toMatch(/<Warmup Duration="\d+" PowerLow="[\d.]+" PowerHigh="[\d.]+"\/>/);
    expect(xml).toMatch(/<Cooldown /);
    expect(sizeBytes).toBeLessThan(64 * 1024);
    expect(fileName).toBe('peakr-sweet-spot-3-co.zwo');
  });

  it('uses the compact interval element for work/rest pairs', () => {
    const w = bare(ride, [
      {
        repeat: 4,
        steps: [
          hrStep(240, 4, { hint: { kind: 'powerZone', value: '95–105 % FTP' } }),
          hrStep(120, 1, { rest: true }),
        ],
      },
    ]);
    const r = buildZwo(w, { name: 'x', indoor: null });
    expect(r.ok && r.file.xml).toContain(
      '<IntervalsT Repeat="4" OnDuration="240" OffDuration="120" OnPower="1" OffPower="0.5"/>',
    );
  });

  it('takes power from the % FTP range, not from the zone', () => {
    const w = bare(ride, [
      {
        repeat: 1,
        steps: [hrStep(600, 4, { hint: { kind: 'powerZone', value: '95–105 % FTP' } })],
      },
    ]);
    const r = buildZwo(w, { name: 'x', indoor: null });
    expect(r.ok && r.file.xml).toContain('<SteadyState Duration="600" Power="1"/>');
    expect(r.ok && r.file.notes).toEqual([]);
  });

  it('converts HR-only steps to % FTP and says so', () => {
    const r = buildZwo(bare(ride, [{ repeat: 1, steps: [hrStep(1200, 2)] }]), {
      name: 'x',
      indoor: null,
    });
    expect(r.ok && r.file.xml).toContain('Power="0.65"');
    expect(r.ok && r.file.notes).toEqual([{ key: 'zwiftNotes.hrFallback' }]);
  });

  it('unrolls repeats that are not a work/rest pair', () => {
    const r = buildZwo(bare(ride, [{ repeat: 3, steps: [hrStep(60, 3)] }]), {
      name: 'x',
      indoor: null,
    });
    expect(r.ok && r.file.xml.match(/<SteadyState/g)?.length).toBe(3);
  });
});

describe('buildZwo run', () => {
  it('writes pace levels and a run sport type', () => {
    const run = bare(runs[0] as Workout, [{ repeat: 1, steps: [hrStep(1500, 2), hrStep(300, 4)] }]);
    const r = buildZwo(run, { name: 'Run', indoor: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.xml).toContain('<sportType>run</sportType>');
    expect(r.file.xml).toContain('Pace="2"');
    expect(r.file.xml).not.toContain('Power');
    expect(r.file.notes).toEqual([{ key: 'zwiftNotes.runPace' }]);
  });
});

describe('buildZwo structure', () => {
  const distanceOnly: Step = { distanceM: 400, zone: 4, target: { kind: 'paceZone', value: 'I' } };

  it('ramps the first warm-up step and the last cool-down step, the rest is steady', () => {
    const w: Workout = {
      ...(runs[0] as Workout),
      warmup: [hrStep(300, 1), hrStep(120, 2), distanceOnly],
      main: [{ repeat: 1, steps: [hrStep(600, 3)] }],
      cooldown: [hrStep(120, 2), hrStep(300, 1)],
    };
    const r = buildZwo(w, { name: 'x', description: 'Easy <spin>', indoor: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lines = r.file.xml.split('\n').filter((l) => /Warmup|Cooldown|SteadyState/.test(l));
    expect(lines.map((l) => l.trim().split(' ')[0])).toEqual([
      '<Warmup',
      '<SteadyState',
      '<SteadyState',
      '<SteadyState',
      '<Cooldown',
    ]);
    expect(r.file.xml).toContain('<Warmup Duration="300" PaceLow="1" PaceHigh="1"/>');
    expect(r.file.xml).toContain('<description>Easy &lt;spin&gt;</description>');
  });

  it('skips warm-up and cool-down steps without a duration', () => {
    const w: Workout = {
      ...ride,
      warmup: [distanceOnly],
      main: [{ repeat: 1, steps: [hrStep(600, 3)] }],
      cooldown: [distanceOnly],
    };
    const r = buildZwo(w, { name: 'x', indoor: null });
    expect(r.ok && r.file.xml).not.toMatch(/Warmup|Cooldown/);
    expect(r.ok && r.file.xml.match(/<SteadyState/g)?.length).toBe(1);
  });

  it('ramps bike warm-ups from a low share of FTP and cool-downs back down', () => {
    const w: Workout = {
      ...ride,
      warmup: [hrStep(600, 2)],
      main: [{ repeat: 1, steps: [hrStep(600, 3)] }],
      cooldown: [hrStep(300, 1)],
    };
    const r = buildZwo(w, { name: 'x', indoor: null });
    expect(r.ok && r.file.xml).toContain(
      '<Warmup Duration="600" PowerLow="0.45" PowerHigh="0.65"/>',
    );
    expect(r.ok && r.file.xml).toContain(
      '<Cooldown Duration="300" PowerLow="0.5" PowerHigh="0.45"/>',
    );
  });

  it('does not use the compact element when the pair is not work/rest', () => {
    const w = bare(ride, [
      { repeat: 2, steps: [hrStep(60, 4), hrStep(60, 1)] },
      { repeat: 2, steps: [hrStep(60, 4), distanceOnly] },
      { repeat: 2, steps: [distanceOnly, hrStep(60, 1, { rest: true })] },
    ]);
    const r = buildZwo(w, { name: 'x', indoor: null });
    expect(r.ok && r.file.xml).not.toContain('IntervalsT');
    expect(r.ok && r.file.xml.match(/<SteadyState/g)?.length).toBe(8);
  });

  it('measures the file in UTF-8 bytes and falls back to a plain file name', () => {
    const r = buildZwo(bare(ride, [{ repeat: 1, steps: [hrStep(60, 3)] }]), {
      name: '¡ü 🚴 中!',
      indoor: null,
    });
    expect(r.ok && r.file.sizeBytes).toBe(r.ok ? Buffer.byteLength(r.file.xml, 'utf8') : -1);
    expect(r.ok && r.file.fileName).toBe('peakr-u.zwo');
    const bare2 = buildZwo(bare(ride, [{ repeat: 1, steps: [hrStep(60, 3)] }]), {
      name: '🚴',
      indoor: null,
    });
    expect(bare2.ok && bare2.file.fileName).toBe('peakr-workout.zwo');
  });

  it('reads power from a power target as well as from a hint', () => {
    const power: Step = {
      durationSec: 300,
      zone: 3,
      target: { kind: 'powerZone', value: '76–90 % FTP' },
    };
    const r = buildZwo(bare(ride, [{ repeat: 1, steps: [power] }]), { name: 'x', indoor: null });
    expect(r.ok && r.file.xml).toContain('Power="0.83"');
    expect(r.ok && r.file.notes).toEqual([]);
  });

  it('uses the indoor version of the session by default', () => {
    const r = buildZwo(ride, { name: 'x' });
    expect(r.ok).toBe(true);
  });
});

describe('buildZwo limits', () => {
  it('rejects sports Zwift cannot show', () => {
    const r = buildZwo({ ...ride, sport: 'swim' }, { name: 'Swim' });
    expect(r).toEqual({ ok: false, reason: 'unsupportedSport' });
  });

  it('rejects sessions without timed steps', () => {
    const r = buildZwo(bare(ride, []), { name: 'x', indoor: null });
    expect(r).toEqual({ ok: false, reason: 'empty' });
  });

  it('refuses files of 64 KB or more', () => {
    const huge = bare(ride, [{ repeat: 2000, steps: [hrStep(60, 3)] }]);
    expect(buildZwo(huge, { name: 'x', indoor: null })).toEqual({ ok: false, reason: 'tooLarge' });
  });
});

describe('Zwift activities in the import pipeline', () => {
  const strava: SourceActivity = {
    source: 'strava',
    externalId: 's1',
    sport: 'bike',
    startTime: '2026-10-26T06:00:00Z',
    date: '2026-10-26',
    durationSec: 3600,
    distanceM: 30_000,
    elevationGainM: 0,
    avgHr: 140,
    maxHr: 170,
    swimPaceSecPer100m: null,
    polyline: null,
    name: 'Zwift - Watopia',
    indoor: true,
    commute: false,
    summary: false,
    rpe: null,
  };

  it('keeps one record when a Zwift ride arrives via Strava and the watch', () => {
    const watch: SourceActivity = {
      ...strava,
      source: 'garmin',
      externalId: 'g1',
      startTime: '2026-10-26T06:01:30Z',
      durationSec: 3560,
      name: null,
    };
    const merged = dedupeActivities([strava, watch]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.source).toBe('garmin');
    expect(merged[0]?.sources.map((s) => s.externalId)).toEqual(['g1', 's1']);
    expect(merged[0]?.indoor).toBe(true);
  });
});
