import {
  formatDuration,
  type Block,
  type HrZone,
  type Step,
  type Target,
  type Workout,
} from '@peakr/engine';
import type { TFunction } from 'i18next';

/** Readable texts for a planned workout (forecast week 1; later the workout screen). */

export function workoutTitle(t: TFunction, w: Workout): string {
  return w.sport === 'strength'
    ? (t(`strength.types.${w.type}` as never) as string)
    : (t(`workouts.${w.templateId}` as never) as string);
}

function zoneNumber(target: Target): number | null {
  const m = /^Z(\d)$/.exec(target.value);
  return target.kind === 'hrZone' && m ? Number(m[1]) : null;
}

/** Primary target, with the bpm range when the user's zones are known. */
export function targetText(t: TFunction, target: Target, hrZones: readonly HrZone[] = []): string {
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
      return t(`workoutText.pace.${target.value}` as never, {
        defaultValue: target.value,
      }) as string;
    case 'cssOffset':
      return t('workoutText.css', { offset: target.value });
    case 'powerZone':
      return target.value;
    case 'rpe':
      return t('workoutText.rpe', { value: target.value });
  }
}

function amount(t: TFunction, s: Step): string {
  if (s.distanceM !== undefined) return t('workoutText.meters', { value: s.distanceM });
  const sec = s.durationSec ?? 0;
  return sec % 60 === 0 ? t('workoutText.minutes', { count: sec / 60 }) : formatDuration(sec);
}

function stepText(t: TFunction, s: Step): string {
  if (s.rest) return `${amount(t, s)} ${t('workoutText.rest')}`;
  const shortTarget = s.target.kind === 'hrZone' ? s.target.value : targetText(t, s.target);
  const note = s.noteKey ? ` (${t(s.noteKey as never) as string})` : '';
  return `${amount(t, s)} ${shortTarget}${note}`;
}

function blockText(t: TFunction, b: Block): string {
  const steps = b.steps.map((s) => stepText(t, s)).join(' · ');
  return b.repeat > 1 ? `${b.repeat} × (${steps})` : steps;
}

const totalMin = (steps: readonly Step[]) =>
  Math.round(steps.reduce((sum, s) => sum + (s.durationSec ?? 0), 0) / 60);

/** Warm-up / main set / cool-down lines of an endurance workout. */
export function structureLines(t: TFunction, w: Workout): string[] {
  const lines: string[] = [];
  const warm = totalMin(w.warmup);
  if (warm > 0) lines.push(t('workoutText.warmup', { count: warm }));
  for (const b of w.main) lines.push(blockText(t, b));
  const cool = totalMin(w.cooldown);
  if (cool > 0) lines.push(t('workoutText.cooldown', { count: cool }));
  return lines;
}

/** "3 × 8–12 Goblet squat" lines of a strength workout. */
export function exerciseLines(t: TFunction, w: Workout): string[] {
  return (w.exercises ?? []).map((e) =>
    t('workoutText.exercise', {
      sets: e.sets,
      reps: e.reps,
      name: t(`exercises.${e.exerciseId}.name` as never, { defaultValue: e.exerciseId }) as string,
    }),
  );
}
