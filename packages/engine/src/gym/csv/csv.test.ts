import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { exercises } from '../../plan/library';
import { assertDefined } from '../../result';
import { KG_PER_LB } from '../units';
import {
  buildImport,
  customFromImport,
  detectMapping,
  exerciseNamesOf,
  groupSessions,
  readRows,
  routineFromImport,
} from './import';
import { createMatcher, guessPattern, normaliseName, type MatchCandidate } from './match';
import { parseCsv } from './parse';
import { dateKey, parseDateTime, parseDuration, parseNumber } from './values';

/** English library names and aliases, as the app passes them to the matcher. */
const texts = JSON.parse(
  readFileSync(
    new URL('../../../../../apps/mobile/src/i18n/locales/en/exercises.json', import.meta.url),
    'utf8',
  ),
) as Record<string, { name: string; aliases: string[] }>;
const candidates: MatchCandidate[] = exercises.map((e) => ({
  id: e.id,
  names: [assertDefined(texts[e.id], e.id).name, ...assertDefined(texts[e.id], e.id).aliases],
  equipment: e.equipment,
}));
const matcher = createMatcher(candidates);

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};
const utc = (p: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}) => Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);

// Synthetic exports in the column layout of each app (our own sample data).
const HEVY = [
  '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"',
  '"Push Day","18 Jan 2026, 07:39","18 Jan 2026, 08:41","Felt strong","Bench Press (Barbell)",,"",0,"warmup",40,10,,,',
  '"Push Day","18 Jan 2026, 07:39","18 Jan 2026, 08:41","Felt strong","Bench Press (Barbell)",,"",1,"normal",80,8,,,8',
  '"Push Day","18 Jan 2026, 07:39","18 Jan 2026, 08:41","Felt strong","Bench Press (Barbell)",,"",2,"normal",80,7,,,8.5',
  '"Push Day","18 Jan 2026, 07:39","18 Jan 2026, 08:41","Felt strong","Lateral Raise (Dumbbell)",0,"",0,"normal",10,15,,,',
  '"Push Day","18 Jan 2026, 07:39","18 Jan 2026, 08:41","Felt strong","Triceps Pushdown",0,"rope",0,"dropset",25,12,,,',
  '"Push Day","18 Jan 2026, 07:39","18 Jan 2026, 08:41","Felt strong","Plank",,"",0,"normal",,,,60,',
  '"Legs","20 Jan 2026, 18:00","20 Jan 2026, 19:10","","Leg Extension (Machine)",,"",0,"normal",50,12,,,',
  '"Legs","20 Jan 2026, 18:00","20 Jan 2026, 19:10","","Squat (Barbell)",,"",0,"failure",100,5,,,10',
  '"Legs","20 Jan 2026, 18:00","20 Jan 2026, 19:10","","Sled Push",,"",0,"normal",120,,0.02,,',
].join('\n');

const STRONG = [
  'Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE',
  '2026-02-01 08:30:12;Upper A;1h 5m;Lat Pulldown (Cable);1;99;10;0;0;;;',
  '2026-02-01 08:30:12;Upper A;1h 5m;Lat Pulldown (Cable);2;99;9;0;0;;;8',
  '2026-02-01 08:30:12;Upper A;1h 5m;Seated Row (Cable);W;45;12;0;0;;;',
  '2026-02-01 08:30:12;Upper A;1h 5m;Seated Row (Cable);1;135;10;0;0;"slow, controlled";;',
  '2026-02-03 18:00:00;Lower;45m;Leg Press;1;225,5;12;0;0;;"Gym was busy; short session";',
].join('\r\n');

describe('CSV values', () => {
  it('reads the date formats gym apps export', () => {
    const at = (s: string, dayFirst = false) => {
      const p = parseDateTime(s, dayFirst);
      return p ? `${dateKey(p)} ${p.hour}:${p.minute}` : null;
    };
    expect(at('18 Jan 2026, 07:39')).toBe('2026-01-18 7:39');
    expect(at('2026-01-18 07:39:12')).toBe('2026-01-18 7:39');
    expect(at('2026-01-18T07:39:12Z')).toBe('2026-01-18 7:39');
    expect(at('2026-01-18T07:39:12.123+01:00')).toBe('2026-01-18 7:39');
    expect(at('18.01.2026 07:39')).toBe('2026-01-18 7:39');
    expect(at('01/18/2026 7:39 PM')).toBe('2026-01-18 19:39');
    expect(at('18/01/2026 07:39')).toBe('2026-01-18 7:39');
    expect(at('03/04/2026 07:39', true)).toBe('2026-04-03 7:39');
    expect(at('Jan 18, 2026 12:05 AM')).toBe('2026-01-18 0:5');
    expect(at('2026-01-18')).toBe('2026-01-18 0:0');
    expect(at('31 Feb 2026')).toBeNull();
    expect(at('yesterday')).toBeNull();
  });

  it('reads durations and numbers', () => {
    expect(parseDuration('1h 5m')).toBe(3900);
    expect(parseDuration('45m')).toBe(2700);
    expect(parseDuration('30s')).toBe(30);
    expect(parseDuration('1:05:00')).toBe(3900);
    expect(parseDuration('65:00')).toBe(3900);
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('long')).toBeNull();
    expect(parseNumber('62,5')).toBe(62.5);
    expect(parseNumber(' 80 ')).toBe(80);
    expect(parseNumber('')).toBeUndefined();
    expect(parseNumber('n/a')).toBeUndefined();
  });
});

describe('CSV parsing', () => {
  it('handles quotes, delimiters inside quotes, CRLF and blank lines', () => {
    const t = parseCsv('﻿a;b;c\r\n1;"x;y";"he said ""hi"""\r\n\r\n2;"multi\nline";\n');
    expect(t.delimiter).toBe(';');
    expect(t.headers).toEqual(['a', 'b', 'c']);
    expect(t.rows).toEqual([
      ['1', 'x;y', 'he said "hi"'],
      ['2', 'multi\nline', ''],
    ]);
    expect(t.lineNumbers).toEqual([2, 4]);
  });

  it('detects commas and tabs and pads short rows', () => {
    expect(parseCsv('a,b,c\n1,2').rows).toEqual([['1', '2', '']]);
    expect(parseCsv('a\tb\n1\t2\r3\t4').rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(parseCsv('').headers).toEqual([]);
  });
});

describe('Hevy export', () => {
  const table = parseCsv(HEVY);
  const { preset, mapping } = detectMapping(table.headers);
  const { rows, issues } = readRows(table, mapping);

  it('is detected with the right columns and units', () => {
    expect(preset).toBe('hevy');
    expect(mapping.weightUnit).toBe('kg');
    expect(mapping.distanceUnit).toBe('km');
    expect(table.headers[assertDefined(mapping.columns.exerciseName, 'col')]).toBe(
      'exercise_title',
    );
    expect(table.headers[assertDefined(mapping.columns.duration, 'col')]).toBe('duration_seconds');
    expect(issues).toEqual([]);
  });

  it('groups sets into sessions with duration, set types and units', () => {
    const sessions = groupSessions(rows);
    expect(sessions.map((s) => [s.title, dateKey(s.start), s.durationMin, s.rows.length])).toEqual([
      ['Push Day', '2026-01-18', 62, 6],
      ['Legs', '2026-01-20', 70, 3],
    ]);
    expect(sessions[0]?.notes).toBe('Felt strong');
    const push = assertDefined(sessions[0], 'push').rows;
    expect(push.map((r) => r.setType)).toEqual([
      'warmup',
      'working',
      'working',
      'working',
      'drop',
      'working',
    ]);
    expect(push[2]).toMatchObject({ weightKg: 80, reps: 7, rpe: 8.5 });
    expect(push[4]).toMatchObject({ notes: 'rope' });
    expect(push[5]).toMatchObject({ durationSec: 60 });
    expect(sessions[1]?.rows[1]?.setType).toBe('failure');
    expect(sessions[1]?.rows[2]).toMatchObject({ weightKg: 120, distanceM: 20 });
  });

  it('matches exercise names against the library', () => {
    const names = exerciseNamesOf(rows).map((n) => n.name);
    const result = Object.fromEntries(names.map((n) => [n, matcher.match(n)]));
    expect(result['Bench Press (Barbell)']).toMatchObject({
      status: 'matched',
      best: { id: 'bench_press' },
    });
    expect(result['Lateral Raise (Dumbbell)']).toMatchObject({
      status: 'matched',
      best: { id: 'lateral_raise' },
    });
    expect(result['Triceps Pushdown']).toMatchObject({
      status: 'matched',
      best: { id: 'triceps_pushdown' },
    });
    expect(result['Plank']).toMatchObject({ status: 'matched', best: { id: 'plank' } });
    expect(result['Leg Extension (Machine)']).toMatchObject({
      status: 'matched',
      best: { id: 'leg_extension' },
    });
    expect(result['Squat (Barbell)']).toMatchObject({
      status: 'matched',
      best: { id: 'back_squat' },
    });
    expect(result['Sled Push']?.status).toBe('unmatched');
  });

  it('builds sessions and sets, and skips them on a second import', () => {
    const drafts = groupSessions(rows);
    const names = exerciseNamesOf(rows);
    const exerciseIds: Record<string, string> = {};
    const created = [];
    for (const n of names) {
      const m = matcher.match(n.name);
      if (m.best) exerciseIds[n.name] = m.best.id;
      else {
        const custom = customFromImport(n.name, n.data, 'sled', m.equipmentHint);
        created.push(custom);
        exerciseIds[n.name] = custom.id;
      }
    }
    expect(created).toMatchObject([
      { id: 'custom:sled', name: 'Sled Push', trackingMode: 'distance', equipment: ['machine'] },
    ]);
    const built = buildImport(drafts, {
      source: 'import:hevy',
      exerciseIds,
      newId: ids(),
      toEpoch: utc,
    });
    expect(built.sessions).toHaveLength(2);
    expect(built.sets).toHaveLength(9);
    expect(built.sessions[0]).toMatchObject({
      date: '2026-01-18',
      startedAt: Date.UTC(2026, 0, 18, 7, 39),
      endedAt: Date.UTC(2026, 0, 18, 8, 41),
      durationMin: 62,
      title: 'Push Day',
      source: 'import:hevy',
      externalId: 'import:hevy:Push Day|18 Jan 2026, 07:39',
    });
    expect(
      built.sets.filter((s) => s.sessionId === built.sessions[0]?.id).map((s) => s.setIndex),
    ).toEqual([0, 1, 2, 3, 4, 5]);
    const again = buildImport(drafts, {
      source: 'import:hevy',
      exerciseIds,
      newId: ids(),
      existingExternalIds: new Set(built.sessions.map((s) => assertDefined(s.externalId, 'id'))),
    });
    expect(again).toEqual({ sessions: [], sets: [], skipped: 2 });
  });

  it('can turn a workout into a routine', () => {
    const [push] = groupSessions(rows);
    const routine = routineFromImport(
      assertDefined(push, 'push'),
      { 'Bench Press (Barbell)': 'bench_press', Plank: 'plank' },
      ids(),
      0,
    );
    expect(routine.name).toBe('Push Day');
    expect(routine.exercises).toMatchObject([
      {
        exerciseId: 'bench_press',
        targetSets: 2,
        target: { kind: 'reps', min: 7, max: 8 },
        weightKg: 80,
      },
      { exerciseId: 'plank', targetSets: 1, target: { kind: 'time', minSec: 60, maxSec: 60 } },
    ]);
  });

  it('reads lb exports from the header', () => {
    const lb = HEVY.replace('"weight_kg"', '"weight_lbs"');
    const t = parseCsv(lb);
    const d = detectMapping(t.headers);
    expect(d.mapping.weightUnit).toBe('lb');
    expect(readRows(t, d.mapping).rows[1]?.weightKg).toBeCloseTo(80 * KG_PER_LB, 10);
  });
});

describe('Strong export', () => {
  const table = parseCsv(STRONG);
  const detected = detectMapping(table.headers);

  it('is detected; weight unit is the user choice', () => {
    expect(detected.preset).toBe('strong');
    expect(table.delimiter).toBe(';');
    expect(table.headers[assertDefined(detected.mapping.columns.sessionDuration, 'col')]).toBe(
      'Duration',
    );
    expect(table.headers[assertDefined(detected.mapping.columns.duration, 'col')]).toBe('Seconds');
  });

  it('converts lb, reads warm-ups from the set order and the session duration', () => {
    const { rows, issues } = readRows(table, { ...detected.mapping, weightUnit: 'lb' });
    expect(issues).toEqual([]);
    const sessions = groupSessions(rows);
    expect(sessions.map((s) => [s.title, s.durationMin, s.rows.length])).toEqual([
      ['Upper A', 65, 4],
      ['Lower', 45, 1],
    ]);
    const upper = assertDefined(sessions[0], 'upper').rows;
    expect(upper.map((r) => r.setType)).toEqual(['working', 'working', 'warmup', 'working']);
    expect(upper[0]?.weightKg).toBeCloseTo(99 * KG_PER_LB, 10);
    expect(upper[3]?.notes).toBe('slow, controlled');
    // Zero distance / seconds are "not recorded", not values.
    expect(upper[0]?.distanceM).toBeUndefined();
    expect(upper[0]?.durationSec).toBeUndefined();
    expect(sessions[1]?.rows[0]?.weightKg).toBeCloseTo(225.5 * KG_PER_LB, 10);
    expect(sessions[1]?.notes).toBe('Gym was busy; short session');
  });

  it('matches its exercise names', () => {
    expect(matcher.match('Lat Pulldown (Cable)').best?.id).toBe('lat_pulldown');
    expect(matcher.match('Seated Row (Cable)').best?.id).toBe('seated_cable_row');
    expect(matcher.match('Leg Press').best?.id).toBe('leg_press');
  });
});

describe('messy CSV', () => {
  const MESSY = [
    '﻿ Workout ; Date ;Exercise;Set;KG;Reps;RPE;Notes',
    '',
    'Mon session;15.03.2026 18:00;bench press;1;62,5;8;;"top set, felt ok"',
    'Mon session;15.03.2026 18:00;;2;60;8;;',
    'Mon session;not a date;Squat;1;100;5;;',
    'Mon session;15.03.2026 18:00;Bulgarian Split Squats (DB);1;20;abc;;',
    'Mon session;15.03.2026 18:00;Pull-ups;1;;10;9;',
    'Mon session;15.03.2026 18:00;Weird Machine Thing;1;35;12;12;',
    '   ',
    'Tue session;16.03.2026;Cable Crossovers;1;15;15;;',
  ].join('\r\n');

  const table = parseCsv(MESSY);
  const detected = detectMapping(table.headers);
  const { rows, issues } = readRows(table, detected.mapping);

  it('maps trimmed, oddly named headers', () => {
    expect(detected.preset).toBeNull();
    expect(table.headers).toEqual([
      'Workout',
      'Date',
      'Exercise',
      'Set',
      'KG',
      'Reps',
      'RPE',
      'Notes',
    ]);
    const c = detected.mapping.columns;
    expect([
      c.sessionTitle,
      c.startTime,
      c.exerciseName,
      c.setOrder,
      c.reps,
      c.rpe,
      c.setNotes,
    ]).toEqual([0, 1, 2, 3, 5, 6, 7]);
    // "KG" is not a known header: the user maps it in the preview.
    expect(c.weight).toBeUndefined();
  });

  it('reports bad rows with their line and keeps the good ones', () => {
    expect(issues).toEqual([
      { line: 4, code: 'missingExercise', column: 'exerciseName' },
      { line: 5, code: 'badDate', column: 'startTime' },
      { line: 6, code: 'badNumber', column: 'reps' },
    ]);
    expect(rows.map((r) => r.exerciseName)).toEqual([
      'bench press',
      'Bulgarian Split Squats (DB)',
      'Pull-ups',
      'Weird Machine Thing',
      'Cable Crossovers',
    ]);
    // RPE above 10 is dropped, not imported as nonsense.
    expect(rows[3]?.rpe).toBeUndefined();
    expect(rows[2]?.rpe).toBe(9);
  });

  it('imports weights once the user maps the column', () => {
    const mapped = readRows(table, {
      ...detected.mapping,
      columns: { ...detected.mapping.columns, weight: 4 },
    });
    expect(mapped.rows[0]).toMatchObject({ weightKg: 62.5, reps: 8, notes: 'top set, felt ok' });
    const sessions = groupSessions(mapped.rows);
    expect(sessions.map((s) => [s.title, dateKey(s.start), s.rows.length])).toEqual([
      ['Mon session', '2026-03-15', 4],
      ['Tue session', '2026-03-16', 1],
    ]);
  });

  it('fuzzy-matches messy names and leaves unknown ones for custom exercises', () => {
    expect(matcher.match('bench press').best?.id).toBe('bench_press');
    expect(matcher.match('Bulgarian Split Squats (DB)').best?.id).toBe('bulgarian_split_squat');
    expect(matcher.match('Pull-ups')).toMatchObject({ status: 'matched', best: { id: 'pull_up' } });
    expect(matcher.match('Cable Crossovers').best?.id).toBe('cable_fly');
    expect(matcher.match('Weird Machine Thing').status).toBe('unmatched');
  });
});

describe('exercise matching', () => {
  it.each([
    ['Bench Press (Barbell)', 'bench_press'],
    ['Incline Bench Press (Dumbbell)', 'incline_press'],
    ['Deadlift (Barbell)', 'deadlift'],
    ['Romanian Deadlift (Dumbbell)', 'romanian_deadlift'],
    ['RDL', 'romanian_deadlift'],
    ['Hip Thrust (Barbell)', 'hip_thrust'],
    ['Lat Pulldown - Wide Grip (Cable)', 'lat_pulldown'],
    ['Seated Leg Curl (Machine)', 'seated_leg_curl'],
    ['Lying Leg Curl (Machine)', 'lying_leg_curl'],
    ['Chest Press (Machine)', 'chest_press_machine'],
    ['Shoulder Press (Machine)', 'shoulder_press_machine'],
    ['Overhead Press (Barbell)', 'overhead_press'],
    ['OHP', 'overhead_press'],
    ['Bicep Curl (Dumbbell)', 'biceps_curl'],
    ['Hammer Curl (Dumbbell)', 'hammer_curl'],
    ['Face Pull (Cable)', 'face_pull'],
    ['Hip Abduction (Machine)', 'hip_abduction_machine'],
    ['Hip Adduction (Machine)', 'hip_adduction_machine'],
    ['Seated Calf Raise (Machine)', 'seated_calf_raise'],
    ['Pec Deck (Machine)', 'pec_deck'],
    ['Reverse Fly (Machine)', 'rear_delt_fly_machine'],
    ['Hack Squat (Machine)', 'hack_squat'],
    ['Leg Press (Machine)', 'leg_press'],
    ['Chin Up', 'chin_up'],
    ['Push Up', 'push_up'],
    ['Farmers Walk', 'farmer_carry'],
    ['Trap Bar Deadlift', 'trap_bar_deadlift'],
    ['Skullcrusher (Barbell)', 'skull_crusher'],
    ['Back Extension (Hyperextension)', 'hyperextension'],
    ['Cable Crunch', 'cable_crunch'],
  ])('%s → %s', (name, id) => {
    expect(matcher.match(name).best?.id).toBe(id);
  });

  it('remembers confirmed names', () => {
    const remembering = createMatcher(candidates, {
      [normaliseName('Sled Push').compact]: 'leg_press',
    });
    expect(remembering.match('Sled push')).toMatchObject({
      status: 'matched',
      best: { id: 'leg_press', score: 1 },
    });
  });

  it('reads equipment hints and guesses patterns for new custom exercises', () => {
    expect(normaliseName('Squat (Smith Machine)').equipmentHint).toBe('smith');
    expect(normaliseName('Row (DB)').equipmentHint).toBe('dumbbell');
    expect(normaliseName('Curl (EZ Bar)').equipmentHint).toBe('ezBar');
    expect(guessPattern('Belt Squat')).toBe('squat');
    expect(guessPattern('Spider Curl')).toBe('arms');
    expect(guessPattern('Machine Fly')).toBe('fly');
    expect(guessPattern('Zercher Carry')).toBe('carry');
    expect(guessPattern('Juggling')).toBe('other');
  });
});
