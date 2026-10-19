import type { Step, WorkoutTemplate } from '../types';
import { ALL_PHASES, hr, intervals, levels, power, reps, rest, rpe, time } from './helpers';

/** Cycling templates – WORKOUTS.md §4. HR leads, power is the hint (or leads with a power meter). */

const WARMUP = [time(15, 2)];
const COOLDOWN = [time(10, 1)];
const spin = (min: number) => rest(min * 60);
const z3 = (min: number) => time(min, 3, hr(3), { hint: power('76–90 % FTP') });
const ss = (min: number) => time(min, 3, hr(3), { hint: power('88–94 % FTP') });
const z4 = (min: number, extra: Partial<Step> = {}) =>
  time(min, 4, hr(4), { hint: power('95–105 % FTP'), ...extra });
const z5 = (min: number) => time(min, 5, hr(5), { hint: power('106–120 % FTP') });
const highCadence = time(1, 2, rpe(4), { noteKey: 'steps.highCadence' });
const lowCadence = time(5, 3, hr(3), { noteKey: 'steps.lowCadence' });

const work = (n: number, step: Step, recoveryMin: number) => intervals(n, step, spin(recoveryMin));

export const bikeTemplates: WorkoutTemplate[] = [
  {
    id: 'bike.recovery',
    sport: 'bike',
    type: 'recovery',
    intensity: 'recovery',
    phases: ALL_PHASES,
    levels: [],
    durationScaled: {
      minMin: 30,
      maxMin: 45,
      fill: { zone: 1, target: hr(1), noteKey: 'steps.highCadence' },
    },
    indoorAlternativeId: 'indoor.trainer',
    legLoad: 'none',
    whyKey: 'why.bike.recovery',
  },
  {
    id: 'bike.endurance',
    sport: 'bike',
    type: 'endurance',
    intensity: 'easy',
    phases: ALL_PHASES,
    levels: [],
    durationScaled: { minMin: 45, maxMin: 120, fill: { zone: 2, target: hr(2) } },
    indoorAlternativeId: 'indoor.trainer',
    legLoad: 'none',
    whyKey: 'why.bike.endurance',
  },
  {
    id: 'bike.long',
    sport: 'bike',
    type: 'long',
    intensity: 'moderate',
    phases: ALL_PHASES,
    levels: [],
    durationScaled: { minMin: 90, maxMin: 360, fill: { zone: 2, target: hr(2) } },
    terrain: 'any',
    indoorAlternativeId: 'indoor.trainer',
    legLoad: 'none',
    whyKey: 'why.bike.long',
  },
  {
    id: 'bike.commute',
    sport: 'bike',
    type: 'commute',
    intensity: 'easy',
    phases: ALL_PHASES,
    levels: [],
    durationScaled: { minMin: 5, maxMin: 360, fill: { zone: 2, target: hr(2) } },
    legLoad: 'none',
    whyKey: 'why.bike.commute',
  },
  {
    id: 'bike.tempo',
    sport: 'bike',
    type: 'tempo',
    intensity: 'moderate',
    phases: ['base', 'build', 'maintain'],
    levels: levels(WARMUP, COOLDOWN, [
      work(2, z3(10), 5),
      work(2, z3(15), 5),
      work(3, z3(15), 5),
      work(2, z3(20), 5),
      work(2, z3(25), 5),
      work(2, z3(30), 5),
    ]),
    indoorAlternativeId: 'indoor.trainer',
    legLoad: 'none',
    whyKey: 'why.bike.tempo',
  },
  {
    id: 'bike.sweetspot',
    sport: 'bike',
    type: 'sweetspot',
    intensity: 'hard',
    phases: ['base', 'build', 'maintain'],
    levels: levels(WARMUP, COOLDOWN, [
      work(3, ss(8), 4),
      work(3, ss(10), 4),
      work(3, ss(12), 4),
      work(2, ss(20), 5),
      work(3, ss(15), 5),
      work(2, ss(25), 5),
      work(3, ss(20), 5),
    ]),
    indoorAlternativeId: 'indoor.trainer',
    legLoad: 'none',
    whyKey: 'why.bike.sweetspot',
  },
  {
    id: 'bike.threshold',
    sport: 'bike',
    type: 'threshold',
    intensity: 'hard',
    phases: ['build', 'peak', 'taper'],
    levels: levels(WARMUP, COOLDOWN, [
      work(4, z4(5), 3),
      work(3, z4(8), 4),
      work(4, z4(8), 4),
      work(3, z4(10), 5),
      work(2, z4(15), 5),
      work(3, z4(12), 5),
      work(2, z4(20), 5),
    ]),
    indoorAlternativeId: 'indoor.trainer',
    legLoad: 'none',
    whyKey: 'why.bike.threshold',
  },
  {
    id: 'bike.vo2',
    sport: 'bike',
    type: 'vo2',
    intensity: 'hard',
    phases: ['build', 'peak', 'taper'],
    levels: levels(WARMUP, COOLDOWN, [
      work(5, z5(2), 2),
      work(6, z5(2), 2),
      work(5, z5(3), 3),
      work(6, z5(3), 3),
      work(5, z5(4), 4),
      work(4, z5(5), 5),
    ]),
    indoorAlternativeId: 'indoor.trainer',
    legLoad: 'none',
    whyKey: 'why.bike.vo2',
  },
  {
    id: 'bike.climb',
    sport: 'bike',
    type: 'climb',
    intensity: 'hard',
    phases: ['build', 'peak'],
    levels: levels(WARMUP, COOLDOWN, [
      work(3, z3(5), 5),
      work(3, z3(8), 5),
      work(3, z4(8, { noteKey: 'steps.standingEvery4' }), 5),
      work(3, z4(10), 5),
      work(2, z4(15), 5),
      work(3, z4(12, { noteKey: 'steps.seatedStanding' }), 5),
    ]),
    terrain: 'climb',
    indoorAlternativeId: 'indoor.trainer',
    legLoad: 'none',
    whyKey: 'why.bike.climb',
  },
  {
    id: 'bike.cadence',
    sport: 'bike',
    type: 'cadence',
    intensity: 'easy',
    phases: ['base', 'maintain'],
    levels: levels(
      [],
      [time(5, 1)],
      [
        intervals(6, highCadence, time(2, 2)),
        intervals(8, highCadence, time(2, 2)),
        intervals(4, lowCadence, time(3, 2)),
        [reps(4, highCadence, time(2, 2)), reps(2, lowCadence, time(3, 2))],
      ],
    ),
    durationScaled: { minMin: 45, maxMin: 120, fill: { zone: 2, target: hr(2) } },
    indoorAlternativeId: 'indoor.trainer',
    legLoad: 'none',
    whyKey: 'why.bike.cadence',
  },
];
