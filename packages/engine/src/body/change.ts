import type { WeightGoalKind } from '../energy/safety';
import type { MeasurementKey } from './body';

/**
 * Is a change good news for this user? Decided per metric and goal in one place (CLAUDE.md
 * "Body"), never "down is green". Losing weight: less weight, fat and trunk girth is
 * favourable; gaining (building muscle): more weight and more girth of chest, shoulders and
 * limbs is favourable, while fat stays the one to watch; maintaining: staying put is favourable.
 * Changes inside the noise band are neutral. The UI shows the sign or an arrow as well – the tone
 * only adds colour.
 */
export type ChangeTone = 'favourable' | 'unfavourable' | 'neutral';

export type ChangeMetric =
  | MeasurementKey
  | 'weight'
  | 'bodyFat'
  | 'leanMass'
  | 'restingHr'
  | 'hrv'
  | 'sleep'
  | 'loggedDays'
  | 'sessions';

/** +1: up is favourable, −1: down is favourable, 0: stable is favourable, null: no judgement. */
type Direction = 1 | -1 | 0 | null;

/** Waist, belly, hips and neck follow fat; chest, shoulders and limbs follow muscle too. */
const TRUNK = new Set<ChangeMetric>(['waist', 'belly', 'hip', 'neck']);

const GOAL_DIRECTION: Record<
  WeightGoalKind,
  { weight: Direction; trunk: Direction; build: Direction }
> = {
  lose: { weight: -1, trunk: -1, build: null },
  gain: { weight: 1, trunk: null, build: 1 },
  maintain: { weight: 0, trunk: 0, build: 0 },
};

/** The same for every goal: body fat, lean mass, recovery and habits. */
const ALWAYS: Partial<Record<ChangeMetric, Direction>> = {
  bodyFat: -1,
  leanMass: 1,
  restingHr: -1,
  hrv: 1,
  sleep: 1,
  loggedDays: 1,
  sessions: 1,
};

/** Changes up to this size (kg, %, cm, bpm, ms, minutes) are noise. */
const NOISE: Partial<Record<ChangeMetric, number>> = {
  weight: 0.2,
  bodyFat: 0.3,
  leanMass: 0.2,
  restingHr: 2,
  hrv: 3,
  sleep: 15,
  loggedDays: 0,
  sessions: 0,
};
/** Girth measurements: half a centimetre is tape-measure noise. */
const GIRTH_NOISE = 0.5;

function direction(metric: ChangeMetric, goal: WeightGoalKind | null): Direction {
  const fixed = ALWAYS[metric];
  if (fixed !== undefined) return fixed;
  if (!goal) return null;
  const g = GOAL_DIRECTION[goal];
  return metric === 'weight' ? g.weight : TRUNK.has(metric) ? g.trunk : g.build;
}

export function changeTone(
  metric: ChangeMetric,
  goal: WeightGoalKind | null,
  delta: number | null,
): ChangeTone {
  const d = delta === null ? null : direction(metric, goal);
  if (delta === null || d === null) return 'neutral';
  const small = Math.abs(delta) <= (NOISE[metric] ?? GIRTH_NOISE);
  if (d === 0) return small ? 'favourable' : 'unfavourable';
  if (small) return 'neutral';
  return Math.sign(delta) === d ? 'favourable' : 'unfavourable';
}
