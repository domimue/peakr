import { assertDefined } from '../result';
import { planConfig } from './config';
import { getTemplate } from './library';
import { materialize, type Athlete } from './materialize';
import type { WinterSport, WinterVariant, Workout } from './types';

const VARIANT_TEMPLATE: Record<WinterSport, string> = {
  xcski: 'xcski.easy',
  snowshoe: 'snowshoe.easy',
  skitour: 'skitour.ascent',
};

/**
 * Winter variant of equivalent load for easy/long run and bike sessions inside the winter period
 * (CLAUDE.md "Winter sports"). Key quality sessions of a race goal stay in the target sport;
 * non-race goals also get XC-ski intervals instead of tempo/threshold work.
 */
export function winterVariantFor(
  workout: Pick<Workout, 'sport' | 'role' | 'load' | 'level'>,
  athlete: Athlete,
  month: number,
  raceGoal: boolean,
): WinterVariant | null {
  const sports = athlete.profile.winterSports ?? [];
  const months = athlete.profile.winterMonths ?? planConfig.winter.defaultMonths;
  if (sports.length === 0 || !(months as readonly number[]).includes(month)) return null;
  if (workout.sport !== 'run' && workout.sport !== 'bike') return null;

  if (workout.role === 'key' || workout.role === 'quality') {
    if (raceGoal || !sports.includes('xcski')) return null;
    const t = getTemplate('xcski.intervals');
    const m = materialize(t, Math.min(workout.level ?? 1, t.levels.length), 0, 'quality', athlete);
    return { templateId: t.id, sport: 'xcski', durationMin: m.durationMin, load: m.load };
  }
  if (workout.role !== 'easy' && workout.role !== 'long') return null;

  const sport = assertDefined(sports[0], 'winterSport');
  const t = getTemplate(VARIANT_TEMPLATE[sport]);
  const perMin = planConfig.load.zoneWeights[2] * planConfig.load.sportFactors[sport];
  const minutes = Math.round(workout.load / perMin / 5) * 5;
  const m = materialize(t, null, minutes, workout.role, athlete);
  return { templateId: t.id, sport, durationMin: m.durationMin, load: m.load };
}
