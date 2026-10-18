import type { WorkoutTemplate } from '../types';
import {
  ALL_PHASES,
  css,
  dist,
  intervals,
  levels,
  once,
  reps,
  rest,
  rpe,
  secs,
  swim,
  time,
} from './helpers';

/**
 * Swimming templates – WORKOUTS.md §5. Distances are for a 25 m pool and are adapted to the
 * user's pool length; open water converts them to time. Targets are CSS offsets (s/100 m).
 */

const WARMUP = [swim(200, 15)];
const COOLDOWN = [swim(100, 15)];
const drill = (n: number) => reps(n, swim(25, 15, { noteKey: 'steps.drill' }), rest(30));
const kick = reps(4, swim(50, 15, { noteKey: 'steps.kickBoard' }), rest(20));
const easy = (n: number, m: number) => reps(n, swim(m, 12), rest(15));
const pull = once(swim(200, 12, { noteKey: 'steps.pullBuoy' }));

export const swimTemplates: WorkoutTemplate[] = [
  {
    id: 'swim.technique',
    sport: 'swim',
    type: 'technique',
    intensity: 'easy',
    phases: ALL_PHASES,
    levels: [
      { level: 1, warmup: [swim(100, 15)], main: [drill(12), easy(4, 50)], cooldown: [] },
      { level: 2, warmup: WARMUP, main: [drill(12), kick, easy(4, 50)], cooldown: [] },
      { level: 3, warmup: WARMUP, main: [drill(12), kick, easy(4, 100)], cooldown: COOLDOWN },
      { level: 4, warmup: WARMUP, main: [drill(12), easy(6, 100), pull, kick], cooldown: [] },
    ],
    indoorAlternativeId: 'indoor.pool',
    legLoad: 'none',
    whyKey: 'why.swim.technique',
  },
  {
    id: 'swim.aerobic',
    sport: 'swim',
    type: 'aerobic',
    intensity: 'easy',
    phases: ALL_PHASES,
    levels: levels(WARMUP, COOLDOWN, [
      intervals(4, swim(100, 10), rest(20)),
      intervals(6, swim(100, 10), rest(20)),
      intervals(4, swim(200, 10), rest(30)),
      intervals(3, swim(300, 10), rest(30)),
      intervals(2, swim(500, 10), rest(45)),
      [once(swim(1500, 10))],
    ]),
    // Extra time is swum continuously before the main set.
    durationScaled: {
      minMin: 15,
      maxMin: 75,
      fill: { zone: 2, target: css(10), noteKey: 'steps.continuous' },
    },
    indoorAlternativeId: 'indoor.pool',
    legLoad: 'none',
    whyKey: 'why.swim.aerobic',
  },
  {
    // Continuous easy swimming – used when a session has to become easier.
    id: 'swim.easy',
    sport: 'swim',
    type: 'easy',
    intensity: 'easy',
    phases: ALL_PHASES,
    levels: [],
    durationScaled: {
      minMin: 15,
      maxMin: 60,
      fill: { zone: 2, target: css(10), noteKey: 'steps.continuous' },
    },
    indoorAlternativeId: 'indoor.pool',
    legLoad: 'none',
    whyKey: 'why.swim.easy',
  },
  {
    id: 'swim.css',
    sport: 'swim',
    type: 'css',
    intensity: 'hard',
    phases: ['base', 'build', 'peak', 'taper', 'maintain'],
    levels: levels(
      [swim(300, 15)],
      [swim(200, 15)],
      [
        intervals(8, swim(50, 0), rest(15)),
        intervals(6, swim(100, 0), rest(15)),
        intervals(8, swim(100, 0), rest(15)),
        intervals(10, swim(100, 0), rest(15)),
        intervals(5, swim(200, 0), rest(20)),
        intervals(4, swim(300, 0), rest(20)),
        intervals(3, swim(400, 0), rest(30)),
      ],
    ),
    indoorAlternativeId: 'indoor.pool',
    legLoad: 'none',
    whyKey: 'why.swim.css',
  },
  {
    id: 'swim.speed',
    sport: 'swim',
    type: 'speed',
    intensity: 'hard',
    phases: ['build', 'peak', 'taper'],
    levels: levels(WARMUP, COOLDOWN, [
      intervals(8, dist(25, 5, rpe(9)), rest(30)),
      intervals(12, dist(25, 5, rpe(9)), rest(30)),
      intervals(8, swim(50, -5), rest(30)),
      intervals(10, swim(50, -5), rest(30)),
    ]),
    indoorAlternativeId: 'indoor.pool',
    legLoad: 'none',
    whyKey: 'why.swim.speed',
  },
  {
    id: 'swim.openwater',
    sport: 'swim',
    type: 'openwater',
    intensity: 'moderate',
    phases: ['build', 'peak'],
    levels: levels(
      [],
      [],
      [
        [
          once(time(15, 2, css(10))),
          reps(6, secs(20, 3, css(5), { noteKey: 'steps.sighting' }), secs(40, 2, css(10))),
        ],
        [once(time(25, 2, css(10)))],
        [once(time(26, 2, css(10))), reps(3, time(3, 4, css(0)))],
        [once(time(45, 2, css(10), { noteKey: 'steps.drafting' }))],
      ],
    ),
    indoorAlternativeId: 'indoor.pool',
    legLoad: 'none',
    whyKey: 'why.swim.openwater',
  },
];
