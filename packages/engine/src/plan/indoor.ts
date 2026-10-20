import { planConfig } from './config';
import { flattenSteps, round1, totalDurationSec } from './load';
import type { Block, PlanNote, Step, Workout } from './types';

/**
 * Indoor version of an outdoor session with equivalent load (CLAUDE.md "Weather check"):
 * run → treadmill, bike → indoor trainer, open water → pool.
 *
 * The treadmill is not the road, so the session is adapted, not copied: a 1 % incline replaces the
 * missing air resistance (or the planned terrain's gradient, hill reps 6–8 %), heart rate leads
 * because it runs higher indoors (heat, no airflow), reps start once the belt is up to speed, long
 * runs may be split, and descents cannot be replicated – long and downhill runs therefore prefer
 * "move to another day". Rides are capped at 90 min on the trainer and count denser (no coasting).
 */

export type IndoorKind = 'treadmill' | 'trainer' | 'pool';

export interface IndoorVersion {
  kind: IndoorKind;
  /** Treadmill incline in % (1 % replaces air resistance on the flat). */
  inclinePct: number | null;
  warmup: Step[];
  main: Block[];
  cooldown: Step[];
  /** Planned minutes indoors (shorter than outside only for capped trainer rides). */
  durationMin: number;
  load: number;
  /** What changes indoors and why, rendered via i18n (`indoorNotes.<key>`). */
  notes: PlanNote[];
  /** The indoor version is a poor substitute: offer "move to another day" first. */
  preferMove: boolean;
}

const cfg = planConfig.indoor;

const KIND_BY_ALTERNATIVE: Record<string, IndoorKind> = {
  'indoor.treadmill': 'treadmill',
  'indoor.treadmill_incline': 'treadmill',
  'indoor.trainer': 'trainer',
  'indoor.pool': 'pool',
};

/** Average incline of the planned terrain: gain per km in m ÷ 10 = %. */
function terrainIncline(w: Workout): number {
  const pct = w.terrain ? Math.round(w.terrain.gainPerKm / 10) : 0;
  return Math.min(cfg.treadmillMaxInclinePct, Math.max(cfg.treadmillFlatInclinePct, pct));
}

/** Pace in s/km → treadmill speed in km/h (one decimal, as treadmills show it). */
export function treadmillSpeedKmh(secPerKm: number): number {
  return round1(3600 / secPerKm);
}

const hasReps = (main: readonly Block[]) =>
  main.some((b) => b.repeat > 1 && b.steps.some((s) => !s.rest && s.zone >= 3));

function treadmill(w: Workout): IndoorVersion {
  const hills = w.type === 'hills';
  const descent = w.templateId === 'run.downhill' || w.terrain?.eccentric === true;
  const main = hills
    ? w.main.map((b) => ({
        repeat: b.repeat,
        steps: b.steps.map((s) => (s.rest ? s : { ...s, noteKey: 'steps.indoor.inclineRep' })),
      }))
    : w.main;
  const notes: PlanNote[] = [{ key: 'indoorNotes.treadmillHeat' }];
  if (hasReps(w.main)) notes.push({ key: 'indoorNotes.treadmillRamp' });
  if (w.durationMin >= cfg.treadmillSplitFromMin) notes.push({ key: 'indoorNotes.treadmillSplit' });
  if (descent) notes.push({ key: 'indoorNotes.treadmillNoDescent' });
  return {
    kind: 'treadmill',
    inclinePct: hills ? cfg.treadmillHillInclinePct : terrainIncline(w),
    warmup: w.warmup,
    main,
    cooldown: w.cooldown,
    durationMin: w.durationMin,
    load: w.load,
    notes,
    preferMove: descent || w.durationMin > cfg.treadmillPreferMoveFromMin,
  };
}

/**
 * Trainer: same structure; rides over the cap lose time from their easy single steps (fill and
 * long endurance parts), never from the reps. Load counts the denser indoor minutes.
 */
function trainer(w: Workout): IndoorVersion {
  const outdoorSec = totalDurationSec(flattenSteps(w.warmup, w.main, w.cooldown));
  const capSec = cfg.trainerMaxMin * 60;
  const notes: PlanNote[] = [{ key: 'indoorNotes.trainerFan' }];
  if (outdoorSec <= capSec) {
    return {
      kind: 'trainer',
      inclinePct: null,
      warmup: w.warmup,
      main: w.main,
      cooldown: w.cooldown,
      durationMin: w.durationMin,
      load: w.load,
      notes,
      preferMove: false,
    };
  }
  const easySec = w.main
    .filter((b) => b.repeat === 1)
    .flatMap((b) => b.steps)
    .filter((s) => !s.rest && s.zone <= 2)
    .reduce((sum, s) => sum + (s.durationSec ?? 0), 0);
  const cut = Math.min(outdoorSec - capSec, easySec);
  const factor = easySec > 0 ? (easySec - cut) / easySec : 1;
  const main = w.main.map((b) =>
    b.repeat !== 1
      ? b
      : {
          repeat: 1,
          steps: b.steps.map((s) =>
            !s.rest && s.zone <= 2 && s.durationSec !== undefined
              ? { ...s, durationSec: Math.round((s.durationSec * factor) / 60) * 60 }
              : s,
          ),
        },
  );
  const indoorSec = totalDurationSec(flattenSteps(w.warmup, main, w.cooldown));
  const durationMin = Math.round(indoorSec / 60);
  notes.push({
    key: 'indoorNotes.trainerCapped',
    params: { outdoor: w.durationMin, indoor: durationMin },
  });
  return {
    kind: 'trainer',
    inclinePct: null,
    warmup: w.warmup,
    main,
    cooldown: w.cooldown,
    durationMin,
    load: round1(Math.min(w.load, (w.load * indoorSec * cfg.trainerDensity) / outdoorSec)),
    notes,
    preferMove: true,
  };
}

function pool(w: Workout): IndoorVersion {
  return {
    kind: 'pool',
    inclinePct: null,
    warmup: w.warmup,
    main: w.main,
    cooldown: w.cooldown,
    durationMin: w.durationMin,
    load: w.load,
    notes: w.templateId === 'swim.openwater' ? [{ key: 'indoorNotes.poolOpenWater' }] : [],
    preferMove: false,
  };
}

/** `null` when the session has no indoor alternative (strength, commutes, bricks). */
export function indoorVersion(w: Workout): IndoorVersion | null {
  const kind = w.indoorAlternativeId ? KIND_BY_ALTERNATIVE[w.indoorAlternativeId] : undefined;
  if (!kind || w.role === 'commute') return null;
  if (kind === 'treadmill') return treadmill(w);
  if (kind === 'trainer') return trainer(w);
  return pool(w);
}
