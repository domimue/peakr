import { planConfig } from '../config';
import type { GoalKind, Step, WorkoutLevel, WorkoutTemplate } from '../types';
import { hr, once, reps, rpe, swim, time } from './helpers';

/** Bricks, winter sports and benchmark tests – WORKOUTS.md §6–7. */

const bike = (min: number, zone: 2 | 4 = 2): Step =>
  time(min, zone, zone === 2 ? hr(2) : rpe(7), {
    sport: 'bike',
    ...(zone === 4 ? { noteKey: 'steps.raceEffort' } : {}),
  });
const run = (min: number, zone: 2 | 4 = 2): Step =>
  time(min, zone, zone === 2 ? hr(2) : rpe(7), {
    sport: 'run',
    ...(zone === 4 ? { noteKey: 'steps.racePace' } : {}),
  });

function brickLevel(level: number, bikeMain: Step[][], runMain: Step[]): WorkoutLevel {
  return {
    level,
    warmup: [],
    main: [
      ...bikeMain.map((steps, i) => (i === 1 ? reps(2, ...steps) : once(...steps))),
      once(...runMain),
    ],
    cooldown: [],
  };
}

/** Brick L5: race simulation with 70 % of the race bike and 40 % of the race run duration. */
export function raceSimulationLevel(goal: GoalKind): WorkoutLevel {
  const cfg = planConfig.multisport;
  const key = goal in cfg.raceBikeMin ? (goal as keyof typeof cfg.raceBikeMin) : 'tri_olympic';
  const bikeMin = Math.round((cfg.raceBikeMin[key] * 0.7) / 5) * 5;
  const runMin = Math.round((cfg.raceRunMin[key] * 0.4) / 5) * 5;
  return {
    level: 5,
    warmup: [],
    main: [once(bike(10), bike(bikeMin - 10, 4)), once(run(runMin, 4))],
    cooldown: [],
  };
}

export const multisportTemplates: WorkoutTemplate[] = [
  {
    id: 'brick',
    sport: 'brick',
    type: 'brick',
    intensity: 'hard',
    phases: ['build', 'peak'],
    levels: [
      brickLevel(1, [[bike(45)]], [run(10)]),
      brickLevel(2, [[bike(60)]], [run(15)]),
      brickLevel(3, [[bike(25)], [bike(10, 4), bike(5)], [bike(20)]], [run(5), run(10, 4), run(5)]),
      brickLevel(
        4,
        [[bike(30)], [bike(15, 4), bike(5)], [bike(20)]],
        [run(10), run(15, 4), run(5)],
      ),
      raceSimulationLevel('tri_olympic'),
    ],
    legLoad: 'none',
    whyKey: 'why.brick',
  },
];

export const winterTemplates: WorkoutTemplate[] = [
  {
    id: 'xcski.easy',
    sport: 'xcski',
    type: 'easy',
    intensity: 'easy',
    phases: ['base', 'build', 'maintain'],
    levels: [],
    durationScaled: { minMin: 45, maxMin: 120, fill: { zone: 2, target: hr(2) } },
    legLoad: 'none',
    whyKey: 'why.winter.xcski',
  },
  {
    id: 'xcski.intervals',
    sport: 'xcski',
    type: 'intervals',
    intensity: 'hard',
    phases: ['base', 'maintain'],
    levels: (
      [
        [3, 2],
        [4, 2],
        [5, 3],
        [6, 3],
      ] as const
    ).map(([on, off], i) => ({
      level: i + 1,
      warmup: [time(15, 2)],
      main: [reps(5, time(on, 4), time(off, 1, hr(1), { rest: true }))],
      cooldown: [time(10, 1)],
    })),
    legLoad: 'none',
    whyKey: 'why.winter.xcskiIntervals',
  },
  {
    id: 'skitour.ascent',
    sport: 'skitour',
    type: 'ascent',
    intensity: 'moderate',
    phases: ['base', 'build', 'maintain'],
    levels: [],
    durationScaled: { minMin: 60, maxMin: 300, fill: { zone: 2, target: hr(2) } },
    terrain: 'climb',
    legLoad: 'light',
    whyKey: 'why.winter.skitour',
  },
  {
    id: 'snowshoe.easy',
    sport: 'snowshoe',
    type: 'easy',
    intensity: 'easy',
    phases: ['base', 'build', 'maintain'],
    levels: [],
    durationScaled: { minMin: 45, maxMin: 150, fill: { zone: 2, target: hr(2) } },
    legLoad: 'none',
    whyKey: 'why.winter.snowshoe',
  },
];

const testPhases: WorkoutTemplate['phases'] = ['base', 'build', 'maintain'];
const single = (warmup: Step[], main: Step[], cooldown: Step[]): WorkoutLevel[] => [
  { level: 1, warmup, main: [once(...main)], cooldown },
];

export const benchmarkTemplates: WorkoutTemplate[] = [
  {
    id: 'bench.run_5k',
    sport: 'run',
    type: 'benchmark_5k',
    intensity: 'hard',
    phases: testPhases,
    levels: single(
      [time(15, 2)],
      [{ distanceM: 5000, zone: 5, target: rpe(10), noteKey: 'steps.timeTrial' }],
      [time(10, 1)],
    ),
    terrain: 'flat',
    legLoad: 'none',
    whyKey: 'why.benchmark.run5k',
  },
  {
    id: 'bench.run_30min',
    sport: 'run',
    type: 'benchmark_30min',
    intensity: 'hard',
    phases: testPhases,
    levels: single(
      [time(15, 2)],
      [time(10, 4, rpe(9)), time(20, 4, rpe(9), { noteKey: 'steps.lthrWindow' })],
      [time(10, 1)],
    ),
    terrain: 'flat',
    legLoad: 'none',
    whyKey: 'why.benchmark.run30',
  },
  {
    id: 'bench.swim_css',
    sport: 'swim',
    type: 'benchmark_css',
    intensity: 'hard',
    phases: testPhases,
    levels: single(
      [swim(400, 15)],
      [
        swim(400, -5, { noteKey: 'steps.timeTrial' }),
        time(5, 1, hr(1), { rest: true }),
        swim(200, -5, { noteKey: 'steps.timeTrial' }),
      ],
      [swim(200, 15)],
    ),
    legLoad: 'none',
    whyKey: 'why.benchmark.swimCss',
  },
  {
    id: 'bench.bike_ftp20',
    sport: 'bike',
    type: 'benchmark_ftp',
    intensity: 'hard',
    phases: testPhases,
    levels: single(
      [time(20, 2)],
      [time(20, 5, rpe(9), { noteKey: 'steps.timeTrial' })],
      [time(15, 1)],
    ),
    legLoad: 'none',
    whyKey: 'why.benchmark.bikeFtp',
  },
];
