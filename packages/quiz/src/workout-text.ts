import {
  formatDuration,
  type Block,
  type HrZone,
  type Step,
  type Target,
  type Workout,
} from '@peakr/engine';

/**
 * Readable texts for a planned workout (forecast week 1, workout screen), shared by web and app so
 * both describe a session the same way. Keys live in `@peakr/i18n` (`plan.json`); `t` is the
 * surface's translate function (i18next in the app, the site's translator on the web) and must
 * support `count` plurals and `defaultValue`.
 */

export type Translate = (key: string, params?: Readonly<Record<string, unknown>>) => string;

export function workoutTitle(t: Translate, w: Workout): string {
  return w.sport === 'strength'
    ? t(`strength.types.${w.templateType}`)
    : t(`workouts.${w.templateId}`);
}

/** Duration range, e.g. "30–35 min" (a single value when fixed, e.g. commutes). */
export function durationText(t: Translate, w: Pick<Workout, 'duration'>): string {
  const { minMin, maxMin } = w.duration;
  return minMin === maxMin
    ? t('workoutText.minutes', { count: minMin })
    : t('workoutText.minutesRange', { min: minMin, max: maxMin });
}

export function zoneNumber(target: Target): number | null {
  const m = /^Z(\d)$/.exec(target.value);
  return target.kind === 'hrZone' && m ? Number(m[1]) : null;
}

/** Primary target, with the bpm range when the user's zones are known. */
export function targetText(t: Translate, target: Target, hrZones: readonly HrZone[] = []): string {
  switch (target.kind) {
    case 'hrZone': {
      const n = zoneNumber(target);
      const zone = hrZones.find((z) => z.zone === n);
      if (n === null) return target.value;
      if (zone?.minBpm != null && zone.maxBpm != null) {
        return t('workoutText.hrZoneRange', { zone: n, min: zone.minBpm, max: zone.maxBpm });
      }
      return t('workoutText.hrZone', { zone: n });
    }
    case 'paceZone':
      return t(`workoutText.pace.${target.value}`, {
        defaultValue: target.value,
      });
    case 'cssOffset':
      return t('workoutText.css', { offset: target.value });
    case 'powerZone':
      return target.value;
    case 'rpe':
      return t('workoutText.rpe', { value: target.value });
  }
}

function amount(t: Translate, s: Step): string {
  if (s.distanceM !== undefined) return t('workoutText.meters', { value: s.distanceM });
  const sec = s.durationSec ?? 0;
  return sec % 60 === 0 ? t('workoutText.minutes', { count: sec / 60 }) : formatDuration(sec);
}

function stepText(t: Translate, s: Step): string {
  if (s.rest) return `${amount(t, s)} ${t('workoutText.rest')}`;
  const shortTarget = s.target.kind === 'hrZone' ? s.target.value : targetText(t, s.target);
  const note = s.noteKey ? ` (${t(s.noteKey)})` : '';
  return `${amount(t, s)} ${shortTarget}${note}`;
}

function blockText(t: Translate, b: Block): string {
  const steps = b.steps.map((s) => stepText(t, s)).join(' · ');
  return b.repeat > 1 ? `${b.repeat} × (${steps})` : steps;
}

const totalMin = (steps: readonly Step[]) =>
  Math.round(steps.reduce((sum, s) => sum + (s.durationSec ?? 0), 0) / 60);

/** Warm-up / main set / cool-down lines of an endurance workout. */
export function structureLines(t: Translate, w: Workout): string[] {
  const lines: string[] = [];
  const warm = totalMin(w.warmup);
  if (warm > 0) lines.push(t('workoutText.warmup', { count: warm }));
  for (const b of w.main) lines.push(blockText(t, b));
  const cool = totalMin(w.cooldown);
  if (cool > 0) lines.push(t('workoutText.cooldown', { count: cool }));
  return lines;
}

/** "3 × 8–12 Goblet squat" lines of a strength workout. */
export function exerciseLines(t: Translate, w: Workout): string[] {
  return (w.exercises ?? []).map((e) =>
    t('workoutText.exercise', {
      sets: e.sets,
      reps: e.reps,
      name: t(`exercises.${e.exerciseId}.name`, { defaultValue: e.exerciseId }),
    }),
  );
}
