import type {
  Availability,
  Experience,
  GoalKind,
  Sport,
  StrengthSetup,
  Terrain,
  UserProfile,
} from './types';

/** Shared test fixtures (only imported by tests). */

export const GOALS: GoalKind[] = [
  '5k',
  '10k',
  'half',
  'marathon',
  'fitness',
  'weightloss',
  'granfondo',
  'swim',
  'tri_sprint',
  'tri_olympic',
  'tri_70_3',
  'tri_full',
  'duathlon',
];

export const EXPERIENCES: Experience[] = ['beginner', 'intermediate', 'advanced'];
const TERRAINS: Terrain[] = ['flat', 'rolling', 'hilly', 'mountainous'];

export const AVAILABILITIES: Availability[] = [
  { minutesPerDay: [60, 60, 45, 60, 0, 120, 90], doublesAllowed: false },
  { minutesPerDay: [45, 0, 45, 0, 45, 90, 0], doublesAllowed: false },
  { minutesPerDay: [60, 90, 60, 90, 45, 240, 150], doublesAllowed: true },
  { minutesPerDay: [30, 30, 30, 30, 30, 60, 60], doublesAllowed: true },
  { minutesPerDay: [90, 90, 90, 90, 90, 300, 180], doublesAllowed: false },
];

const STRENGTH: StrengthSetup[] = [
  { mode: 'none' },
  { mode: 'peakr', equipment: 'gym' },
  { mode: 'peakr' },
  { mode: 'split', split: 'pushPullLegs', daysPerWeek: 3, equipment: 'gym' },
  { mode: 'split', split: 'upperLower', priority: 'strengthFirst' },
  { mode: 'split', split: 'runners', priority: 'balanced' },
  {
    mode: 'routines',
    routines: [
      {
        id: 'legs',
        name: 'Leg day',
        durationMin: 45,
        exercises: [
          { exerciseId: 'back_squat', sets: 4, reps: '5' },
          { name: 'Sled push', sets: 3, reps: '20 m' },
        ],
      },
      {
        id: 'arms',
        name: 'Arms',
        durationMin: 30,
        exercises: [{ exerciseId: 'biceps_curl', sets: 3, reps: '12' }],
      },
    ],
  },
  { mode: 'log' },
];

/** Sports for a goal in the grid: required ones plus a rotating extra selection. */
export function sportsFor(goal: GoalKind, i: number): Sport[] {
  switch (goal) {
    case '5k':
    case '10k':
    case 'half':
    case 'marathon':
      return i % 3 === 0 ? ['run', 'bike'] : ['run'];
    case 'granfondo':
      return i % 2 === 0 ? ['bike'] : ['bike', 'run'];
    case 'swim':
      return i % 2 === 0 ? ['swim'] : ['swim', 'run'];
    case 'duathlon':
      return i % 2 === 0 ? ['run', 'bike'] : ['run', 'bike', 'swim'];
    case 'fitness':
    case 'weightloss':
      return (
        [['run'], ['bike'], ['run', 'bike'], ['swim', 'bike'], ['run', 'bike', 'swim']] as Sport[][]
      )[i % 5] as Sport[];
    default:
      return ['swim', 'bike', 'run'];
  }
}

export interface GridCase {
  name: string;
  profile: UserProfile;
  goal: GoalKind;
  availability: Availability;
  start: string;
  target?: string;
}

/** Deterministic grid over goals × experience × availability with varied profile details. */
export function grid(): GridCase[] {
  const cases: GridCase[] = [];
  let i = 0;
  for (const goal of GOALS) {
    for (const experience of EXPERIENCES) {
      for (const availability of AVAILABILITIES) {
        i++;
        const profile: UserProfile = {
          age: 25 + ((i * 7) % 40),
          experience,
          sports: sportsFor(goal, i),
          terrain: TERRAINS[i % TERRAINS.length] as Terrain,
          strength: STRENGTH[i % STRENGTH.length] as StrengthSetup,
          poolLength: i % 3 === 0 ? 50 : i % 3 === 1 ? 25 : 'openwater',
          hasPowerMeter: i % 2 === 0,
          weakestSport: i % 4 === 0 ? 'swim' : undefined,
          winterSports: i % 5 === 0 ? ['xcski'] : undefined,
        };
        const race = !['fitness', 'weightloss'].includes(goal);
        const start = i % 2 === 0 ? '2026-11-02' : '2026-11-04';
        cases.push({
          name: `${goal}/${experience}/${i}`,
          profile,
          goal,
          availability,
          start,
          target: race
            ? i % 4 === 0
              ? '2027-04-25'
              : '2027-02-28'
            : i % 4 === 0
              ? undefined
              : '2027-01-31',
        });
      }
    }
  }
  return cases;
}
