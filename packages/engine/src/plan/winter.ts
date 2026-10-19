import { planConfig } from './config';
import { getTemplate } from './library';
import { materialize, type Athlete } from './materialize';
import type { WinterSport, WinterVariant, Workout } from './types';

const VARIANT_TEMPLATE: Record<WinterSport, string> = {
  xcski: 'xcski.easy',
  snowshoe: 'snowshoe.easy',
  skitour: 'skitour.ascent',
};

/** Equivalent load: within `planConfig.winter.loadTolerance` of the original session. */
function equivalent(variant: WinterVariant, load: number): boolean {
  return Math.abs(variant.load - load) <= load * planConfig.winter.loadTolerance;
}

/**
 * Winter variant of equivalent load for easy/long run and bike sessions inside the winter period
 * (CLAUDE.md "Winter sports"). Key quality sessions of a race goal stay in the target sport;
 * non-race goals also get XC-ski intervals (the level closest in load) instead of tempo/threshold
 * work. The user's winter sports are tried in order; none within the load tolerance → no variant.
 */
export function winterVariantFor(
  workout: Pick<Workout, 'sport' | 'role' | 'load'>,
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
    const options = t.levels.map((l) => {
      const m = materialize(t, l.level, 0, 'quality', athlete);
      return {
        templateId: t.id,
        sport: 'xcski' as const,
        durationMin: m.durationMin,
        load: m.load,
      };
    });
    const best = options.reduce((a, b) =>
      Math.abs(b.load - workout.load) < Math.abs(a.load - workout.load) ? b : a,
    );
    return equivalent(best, workout.load) ? best : null;
  }
  if (workout.role !== 'easy' && workout.role !== 'long') return null;

  for (const sport of sports) {
    const t = getTemplate(VARIANT_TEMPLATE[sport]);
    const perMin = planConfig.load.zoneWeights[2] * planConfig.load.sportFactors[sport];
    const minutes = Math.round(workout.load / perMin / 5) * 5;
    const m = materialize(t, null, minutes, workout.role, athlete);
    const variant = { templateId: t.id, sport, durationMin: m.durationMin, load: m.load };
    if (equivalent(variant, workout.load)) return variant;
  }
  return null;
}
