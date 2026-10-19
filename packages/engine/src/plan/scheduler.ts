import { assertDefined } from '../result';
import { isHardOnItsOwn } from './classify';
import { composeWeek, EASY_TEMPLATE, type CompositionContext, type Slot } from './composition';
import { planConfig } from './config';
import { toIsoDate } from './dates';
import { rpe, time } from './library/helpers';
import { getTemplate } from './library';
import { clampLevel, recoveryWeekLevel, startLevel } from './levels';
import { flattenSteps, hardShare, round1, totalDurationSec } from './load';
import { materialize, materializeStrength, type Athlete } from './materialize';
import type { WeekSkeleton } from './periodisation';
import { planStrengthWeek, type StrengthSlot } from './strength-plan';
import type {
  Block,
  ExercisePrescription,
  Intensity,
  LegLoad,
  PlanNote,
  SlotRole,
  Sport,
  Step,
  Target,
  Weekday,
  Workout,
  WorkoutTemplate,
  WorkoutTerrain,
} from './types';
import { winterVariantFor } from './winter';

const MAX_SESSIONS_PER_DAY = 2;

/** Purely duration-scaled templates a session is converted to when it must become easier. */
const EASIER_TEMPLATE: Record<Sport | 'brick', string> = {
  run: 'run.easy',
  bike: 'bike.endurance',
  swim: 'swim.easy',
  brick: 'bike.endurance',
};
const EASIER_LONG_TEMPLATE: Record<Sport | 'brick', string> = {
  ...EASIER_TEMPLATE,
  run: 'run.long',
  bike: 'bike.long',
};

export interface ScheduleDay {
  /** Day number (see `parseIsoDate`), null if the day is outside the plan. */
  day: number | null;
  weekday: Weekday;
  minutes: number;
}

/** What the scheduler needs to know about the last day of the previous week. */
export interface PrevDay {
  hard: boolean;
  heavyLegs: boolean;
  eccentric: boolean;
}

export const RESTED: PrevDay = { hard: false, heavyLegs: false, eccentric: false };

export interface WeekInput {
  athlete: Athlete;
  raceGoal: boolean;
  skeleton: WeekSkeleton;
  composition: CompositionContext;
  shares: Record<Sport, number>;
  days: readonly ScheduleDay[];
  doubles: boolean;
  targetLoad: number;
  /** Max load (+10 % over the previous loading week); null if there is no reference week. */
  capLoad: number | null;
  prev: PrevDay;
  /** Race day as day index (0–7, 7 = next Monday): counts as a hard day for spacing. */
  raceDayIndex: number | null;
  levels: ReadonlyMap<string, number>;
  longMin: Readonly<Partial<Record<Sport, number>>>;
  strengthRotation: number;
  /** Prepended to workout ids (regenerated weeks must not reuse ids of kept workouts). */
  idPrefix?: string;
}

export interface WeekOutput {
  workouts: Workout[];
  notes: PlanNote[];
  load: number;
  minutes: number;
  levels: Map<string, number>;
  longMin: Partial<Record<Sport, number>>;
  strengthRotation: number;
  last: PrevDay;
}

interface Item {
  order: number;
  day: number;
  role: SlotRole;
  template: WorkoutTemplate;
  level: number | null;
  /** Wanted minutes for duration-scaled sessions. */
  minutes: number;
  lowered: boolean;
  /** Minimum minutes below the template minimum, set when the load cap is tight. */
  floorMin: number | null;
  /** Long session shortened to respect the load cap. */
  shortened: boolean;
  notes: PlanNote[];
  strength: StrengthSlot | null;
  /** Volume multiplier for strength sessions shrunk to respect the load cap. */
  strengthScale: number;
  // Materialized values
  durationMin: number;
  load: number;
  intensity: Intensity;
  legLoad: LegLoad;
  warmup: Step[];
  main: Block[];
  cooldown: Step[];
  target: Target;
  terrain: WorkoutTerrain | null;
  exercises: ExercisePrescription[] | null;
}

/** Fills one week from availability by priority and spacing rules (CLAUDE.md "Scheduling"). */
export function scheduleWeek(input: WeekInput): WeekOutput {
  return new WeekScheduler(input).run();
}

class WeekScheduler {
  private items: Item[] = [];
  private notes: PlanNote[] = [];
  private order = 0;
  private readonly beginner: boolean;
  private readonly phase;
  private strengthRotation: number;

  constructor(private readonly input: WeekInput) {
    this.beginner = input.athlete.profile.experience === 'beginner';
    this.phase = input.skeleton.phase;
    this.strengthRotation = input.strengthRotation;
  }

  run(): WeekOutput {
    const { input } = this;
    const slots = composeWeek(input.composition, input.raceGoal);
    const first = slots.filter((s) => ['long', 'key', 'brick', 'benchmark'].includes(s.role));
    const second = slots.filter((s) => s.role === 'quality');
    const rest = slots.filter((s) => !first.includes(s) && !second.includes(s));
    const strengthFirst = input.athlete.profile.strength.priority === 'strengthFirst';

    first.forEach((s) => this.placeSlot(s));
    if (strengthFirst) this.placeStrength();
    second.forEach((s) => this.placeSlot(s));
    if (!strengthFirst) this.placeStrength();
    rest.forEach((s) => this.placeSlot(s));

    this.settleLoad();
    return this.output();
  }

  // ------------------------------------------------------------------------------------------
  // Placement

  private placeSlot(slot: Slot): void {
    const template = getTemplate(slot.templateId);
    const item = this.newItem(slot.role, template, slot);
    if (slot.note) item.notes.push(slot.note);
    if (this.place(item)) return;
    if (slot.fallback) return this.placeSlot(slot.fallback);

    // Long session that does not fit: the easy session of that sport takes its place.
    if (
      slot.role === 'long' &&
      slot.sport !== 'brick' &&
      EASY_TEMPLATE[slot.sport] !== slot.templateId
    ) {
      const substitute = this.newItem('long', getTemplate(EASY_TEMPLATE[slot.sport]), slot);
      if (this.place(substitute)) return;
    }
    if (slot.role !== 'easy' && slot.role !== 'technique') {
      const easy = this.newItem('easy', getTemplate(EASY_TEMPLATE[slot.sport]), {});
      easy.notes.push({ key: 'notes.downgraded', params: { type: template.type } });
      this.place(easy);
    }
  }

  private placeStrength(): void {
    const { input } = this;
    const setup = input.athlete.profile.strength;
    if (setup.mode === 'none' || setup.mode === 'log') return;
    const maxSessions = input.days.filter((_, d) =>
      this.hasRoomFor(d, planConfig.plan.minSessionMin),
    ).length;
    const week = planStrengthWeek(setup, {
      phase: this.phase,
      isRecovery: input.skeleton.isRecovery,
      raceGoal: input.raceGoal,
      maxSessions,
      rotation: this.strengthRotation,
    });
    this.strengthRotation = week.rotation;
    this.notes.push(...week.notes);
    // Heavy-leg sessions first: they have the fewest valid days.
    const ordered = [...week.slots].sort(
      (a, b) => Number(b.legLoad === 'heavy') - Number(a.legLoad === 'heavy'),
    );
    for (const s of ordered) {
      const template = s.templateId.startsWith('routine:')
        ? routineTemplate(s)
        : getTemplate(s.templateId);
      const item = this.newItem('strength', template, {});
      item.strength = s;
      if (!this.place(item))
        this.notes.push({ key: 'notes.strengthSkipped', params: { type: s.type } });
    }
  }

  private newItem(role: SlotRole, template: WorkoutTemplate, slot: Partial<Slot>): Item {
    const level = this.defaultLevel(template, slot);
    const scaled = template.durationScaled;
    const minutes = role === 'long' && scaled ? this.longMinutes(template) : (scaled?.minMin ?? 0);
    return {
      order: this.order++,
      day: -1,
      role,
      template,
      level,
      minutes,
      lowered: false,
      floorMin: null,
      shortened: false,
      notes: [],
      strength: null,
      strengthScale: 1,
      durationMin: 0,
      load: 0,
      intensity: template.intensity,
      legLoad: template.legLoad,
      warmup: [],
      main: [],
      cooldown: [],
      target: { kind: 'rpe', value: '0' },
      terrain: null,
      exercises: null,
    };
  }

  private defaultLevel(template: WorkoutTemplate, slot: Partial<Slot>): number | null {
    return template.levels.length > 0 ? this.levelFor(template, slot) : null;
  }

  private levelFor(template: WorkoutTemplate, slot: Partial<Slot>): number {
    const { input } = this;
    const current =
      input.levels.get(template.id) ?? startLevel(input.athlete.profile.experience, template);
    let level = current;
    if (input.skeleton.isRecovery) level = recoveryWeekLevel(level);
    if (this.phase === 'taper') level -= planConfig.levels.taperLevelDrop;
    level -= slot.levelDrop ?? 0;
    level = Math.min(level, slot.maxLevel ?? Infinity);
    return clampLevel(template, level, this.phase);
  }

  private longMinutes(template: WorkoutTemplate): number {
    const { input } = this;
    const sport = template.sport as Sport;
    const cfg = planConfig.long;
    const caps = { run: cfg.runCapMin, bike: cfg.bikeCapMin, swim: cfg.swimCapMin }[sport];
    const cap = caps[input.composition.goal] ?? caps.default;
    let minutes = Math.min(
      cap,
      input.longMin[sport] ?? cfg.startMin[sport][input.athlete.profile.experience],
    );
    if (input.skeleton.isRecovery) minutes *= cfg.recoveryFactor;
    const taper = input.skeleton.taperIndex;
    if (taper !== null) {
      const f = planConfig.phases.taperFactors;
      minutes *= assertDefined(f[Math.min(taper, f.length - 1)], 'taperFactor');
    }
    return Math.round(minutes / 5) * 5;
  }

  /** Tries the item on every day, highest level first; commits the best day. */
  private place(item: Item): boolean {
    const levels = item.level === null ? [null] : range(item.level, 1);
    // Strength first tries days that keep the same muscles apart (see strengthClash).
    const passes = item.strength === null ? [true] : [false, true];
    return passes.some((relaxed) => this.placeOn(item, levels, relaxed));
  }

  private placeOn(item: Item, levels: (number | null)[], relaxed: boolean): boolean {
    for (const level of levels) {
      let best: { day: number; score: number } | null = null;
      for (let d = 0; d < 7; d++) {
        const trial = this.trial(item, level, d);
        if (!trial || !this.canPlace(trial, d) || this.strengthClash(trial, d, relaxed)) continue;
        const score = this.score(trial, d);
        if (!best || score > best.score) best = { day: d, score };
      }
      if (best) {
        const committed = assertDefined(this.trial(item, level, best.day), 'trial');
        committed.day = best.day;
        this.items.push(committed);
        return true;
      }
    }
    return false;
  }

  /** The item materialized for day `d` (scaled sessions shrink to the free minutes), or null. */
  private trial(item: Item, level: number | null, d: number): Item | null {
    const day = this.dayAt(d);
    if (day.day === null) return null;
    const free = day.minutes - this.usedMinutes(d);
    const scaled = item.strength === null ? item.template.durationScaled : undefined;
    let minutes = item.minutes;
    if (scaled) {
      const floor = item.floorMin ?? scaled.minMin;
      if (free < floor) return null;
      minutes = Math.min(Math.max(item.minutes, floor), free);
    }
    let t = this.materializeItem({ ...item, level }, minutes);
    // Strength sessions are shortened (fewer sets) to fit a short day, down to 40 % volume.
    while (item.strength && t.durationMin > free && t.strengthScale > 0.4) {
      t = this.materializeItem({ ...t, strengthScale: t.strengthScale * 0.8 });
    }
    return t.durationMin <= free ? t : null;
  }

  private materializeItem(item: Item, minutes = item.minutes): Item {
    if (item.strength) {
      const s = item.strength;
      const k = item.strengthScale;
      let r = materializeStrength(
        s.def,
        s.legLoad,
        s.legScale * k,
        s.upperScale * k,
        s.durationFactor,
      );
      let template = item.template;
      if (r.exercises.length === 0) {
        // No leg volume left (taper): core & mobility instead.
        template = getTemplate('strength.core_mobility');
        r = materializeStrength(
          assertDefined(template.strength, 'strength'),
          'none',
          1,
          s.upperScale,
          s.durationFactor,
        );
      }
      const sessionRpe = assertDefined(template.strength, 'strength').rpe;
      return {
        ...item,
        template,
        durationMin: r.durationMin,
        load: r.load,
        intensity: r.legLoad === 'heavy' ? 'hard' : 'easy',
        legLoad: r.legLoad,
        warmup: [],
        main: [{ repeat: 1, steps: [time(r.durationMin, 2, rpe(sessionRpe))] }],
        cooldown: [],
        target: rpe(sessionRpe),
        terrain: null,
        exercises: r.exercises,
      };
    }
    const m = materialize(
      item.template,
      item.level,
      minutes,
      item.role,
      this.input.athlete,
      item.floorMin ?? undefined,
    );
    return {
      ...item,
      ...m,
      minutes,
      intensity: item.template.intensity,
      legLoad: item.template.legLoad,
      exercises: null,
    };
  }

  // ------------------------------------------------------------------------------------------
  // Rules

  private itemsOn(d: number): Item[] {
    return this.items.filter((i) => i.day === d);
  }

  private dayAt(d: number): ScheduleDay {
    return assertDefined(this.input.days[d], 'day');
  }

  private freeMinutes(d: number): number {
    return this.dayAt(d).minutes - this.usedMinutes(d);
  }

  private usedMinutes(d: number): number {
    return this.itemsOn(d).reduce((sum, i) => sum + i.durationMin, 0);
  }

  private hasRoomFor(d: number, minutes: number): boolean {
    const day = this.dayAt(d);
    const count = this.itemsOn(d).length;
    if (day.day === null || count >= (this.input.doubles ? MAX_SESSIONS_PER_DAY : 1)) return false;
    return day.minutes - this.usedMinutes(d) >= minutes;
  }

  /** Hard for spacing: §11, and `moderate` for beginners (it becomes hard next to a hard day). */
  private isHard(i: Item): boolean {
    return (
      isHardOnItsOwn({ ...i, sport: i.template.sport, type: i.template.type }) ||
      (this.beginner && i.intensity === 'moderate')
    );
  }

  private dayHard(d: number): boolean {
    if (d < 0) return this.input.prev.hard;
    if (d === this.input.raceDayIndex) return true;
    return this.itemsOn(d).some((i) => this.isHard(i));
  }

  private dayHeavyLegs(d: number): boolean {
    if (d < 0) return this.input.prev.heavyLegs;
    return this.itemsOn(d).some((i) => i.template.sport === 'strength' && i.legLoad === 'heavy');
  }

  private dayEccentric(d: number): boolean {
    if (d < 0) return this.input.prev.eccentric;
    return this.itemsOn(d).some((i) => i.terrain?.eccentric === true);
  }

  private dayLongOrKey(d: number): boolean {
    return this.itemsOn(d).some((i) => isLongOrKey(i.role));
  }

  /**
   * Strength on consecutive days must train different muscles: never the same session (e.g. the
   * Peakr programme twice), and – unless nothing else fits – not legs on both days.
   */
  private strengthClash(item: Item, d: number, relaxed: boolean): boolean {
    const s = item.strength;
    if (s === null) return false;
    return [d - 1, d + 1].some((o) =>
      this.itemsOn(o).some(
        (i) =>
          i.strength !== null &&
          (i.strength.templateId === s.templateId ||
            (!relaxed && i.legLoad !== 'none' && item.legLoad !== 'none')),
      ),
    );
  }

  private canPlace(item: Item, d: number): boolean {
    const existing = this.itemsOn(d);
    if (!this.hasRoomFor(d, 0)) return false;
    const sport = item.template.sport;
    // One session per discipline and day; a brick day (placed first in its week) stays a brick day.
    if (existing.some((i) => i.template.sport === sport || i.template.sport === 'brick'))
      return false;
    if (item.role === 'long' && existing.some((i) => i.role === 'long')) return false;

    const strength = sport === 'strength';
    const heavyLegs = strength && item.legLoad === 'heavy';
    if (this.isHard(item)) {
      // Never two hard endurance sessions on one day; heavy legs may join a hard day (§8.3).
      if (!strength && existing.some((i) => this.isHard(i) && i.template.sport !== 'strength'))
        return false;
      if (!this.dayHard(d) && (this.dayHard(d - 1) || this.dayHard(d + 1))) return false;
    }
    if (isLongOrKey(item.role) && this.dayHeavyLegs(d - 1)) return false;
    if (heavyLegs && (this.dayLongOrKey(d + 1) || this.dayEccentric(d - 1))) return false;
    return true;
  }

  private score(item: Item, d: number): number {
    const day = this.dayAt(d);
    const existing = this.itemsOn(d).length;
    const free = day.minutes - this.usedMinutes(d);
    if (item.role === 'long') return free + (day.weekday >= 5 ? 200 : 0);
    if (item.template.sport === 'strength') {
      if (item.legLoad === 'heavy' && this.itemsOn(d).some((i) => this.isHard(i)))
        return 1000 + free;
      return (existing === 0 ? 500 : 0) + this.spacing(d) * 10 + free / 100;
    }
    if (this.isHard(item)) return this.spacing(d) * 100 + Math.min(free, 120) / 10;
    return (existing === 0 ? 1000 : 0) + free;
  }

  /** Distance in days to the nearest other hard day (7 if none). */
  private spacing(d: number): number {
    let best = 7;
    for (let o = -1; o < 7; o++) {
      if (o !== d && this.dayHard(o)) best = Math.min(best, Math.abs(o - d));
    }
    return best;
  }

  // ------------------------------------------------------------------------------------------
  // Load: fill easy sessions, respect the +10 % cap and 80/20

  private totalLoad(): number {
    return this.items.reduce((sum, i) => sum + i.load, 0);
  }

  private hardShare(): number {
    return hardShare(this.items.map((i) => ({ ...this.toWorkout(i), sport: i.template.sport })));
  }

  private settleLoad(): void {
    const { targetLoad, capLoad } = this.input;
    const budget = capLoad === null ? targetLoad : Math.min(targetLoad, capLoad);
    for (let guard = 0; guard < 200; guard++) {
      this.fillEasy(budget);
      if (capLoad !== null && this.totalLoad() > capLoad) {
        this.reduceForCap();
      } else if (this.hardShare() > planConfig.intensity.maxHardShare) {
        this.reduceIntensity();
      } else {
        return;
      }
    }
    /* v8 ignore next -- every reduction removes load, so the loop always ends earlier */
  }

  private scalable(): Item[] {
    return this.items.filter(
      (i) => i.role === 'easy' && i.template.durationScaled && i.strength === null,
    );
  }

  /** Easy durations so the week hits `budget`, split by sport share (bisection on a factor). */
  private fillEasy(budget: number): void {
    const easy = this.scalable();
    if (easy.length === 0) return;
    const easyOrders = new Set(easy.map((i) => i.order));
    const fixed = this.items.filter((i) => !easyOrders.has(i.order));
    const fixedLoad = fixed.reduce((s, i) => s + i.load, 0);
    const scaledOf = (i: Item) => assertDefined(i.template.durationScaled, 'durationScaled');
    const floorOf = (i: Item) => i.floorMin ?? scaledOf(i).minMin;
    const counts = new Map<string, number>();
    for (const i of easy) counts.set(i.template.sport, (counts.get(i.template.sport) ?? 0) + 1);
    const weight = (i: Item) =>
      this.input.shares[i.template.sport as Sport] /
      assertDefined(counts.get(i.template.sport), 'count');

    // Shortest version of each easy session (levelled ones have a fixed part above the floor).
    const shortest = new Map(easy.map((i) => [i.order, this.materializeItem(i, floorOf(i))]));
    const apply = (k: number): Item[] => {
      const used = [0, 1, 2, 3, 4, 5, 6].map((d) =>
        fixed.filter((i) => i.day === d).reduce((s, i) => s + i.durationMin, 0),
      );
      return easy.map((i, n) => {
        // Keep room for the other easy sessions of that day at their minimum.
        const reserved = easy
          .slice(n + 1)
          .filter((o) => o.day === i.day)
          .reduce((s, o) => s + assertDefined(shortest.get(o.order), 'shortest').durationMin, 0);
        const room = this.dayAt(i.day).minutes - assertDefined(used[i.day], 'used') - reserved;
        const max = Math.min(scaledOf(i).maxMin, room);
        const minutes = Math.round(Math.max(floorOf(i), Math.min(max, k * weight(i))) / 5) * 5;
        const m = this.materializeItem(i, Math.min(minutes, max));
        used[i.day] = assertDefined(used[i.day], 'used') + m.durationMin;
        return m;
      });
    };
    const loadOf = (list: Item[]) => list.reduce((s, i) => s + i.load, fixedLoad);

    let lo = 0;
    let hi = 2000;
    for (let n = 0; n < 40; n++) {
      const mid = (lo + hi) / 2;
      if (loadOf(apply(mid)) <= budget) lo = mid;
      else hi = mid;
    }
    const filled = apply(lo);
    this.items = this.items.map((i) => filled.find((f) => f.order === i.order) ?? i);
  }

  private replace(item: Item, next: Item | null): void {
    this.items = next
      ? this.items.map((i) => (i.order === item.order ? next : i))
      : this.items.filter((i) => i.order !== item.order);
  }

  /** Lowers the level of the candidate with the highest `key`, if a lower level fits and is lighter. */
  private lowerLevel(candidates: Item[], key: (i: Item) => number): boolean {
    const sorted = candidates
      .filter((i) => i.level !== null && i.level > 1 && i.strength === null)
      .sort((a, b) => key(b) - key(a) || a.order - b.order);
    for (const target of sorted) {
      // A lower level is not always shorter or lighter (brick race simulation).
      for (let level = assertDefined(target.level, 'level') - 1; level >= 1; level--) {
        const lowered = this.materializeItem({ ...target, level, lowered: true });
        if (lowered.durationMin > this.freeMinutes(target.day) + target.durationMin) continue;
        if (key(lowered) >= key(target)) continue;
        this.replace(target, lowered);
        return true;
      }
    }
    return false;
  }

  /**
   * The item as an easy session of its discipline on the same day, at most `minutes` long and never
   * longer than the item (so it always fits). Long sessions stay long.
   */
  private toEasy(item: Item, minutes: number, note: PlanNote): Item {
    const sport = item.template.sport as Sport | 'brick';
    const long = item.role === 'long';
    const template = getTemplate(long ? EASIER_LONG_TEMPLATE[sport] : EASIER_TEMPLATE[sport]);
    const duration = Math.min(minutes, item.durationMin);
    return this.materializeItem({
      ...item,
      role: long ? 'long' : 'easy',
      template,
      level: null,
      minutes: duration,
      floorMin: duration,
      notes: [...item.notes, note],
    });
  }

  /**
   * One step towards the load cap: lower a level, shorten the long session, let easy and long
   * sessions go below their template minimum, shrink strength, then convert or drop sessions.
   */
  private reduceForCap(): void {
    if (this.lowerLevel(this.items, (i) => i.load)) return;
    const long = this.items.find(
      (i) =>
        i.role === 'long' &&
        i.template.durationScaled &&
        i.minutes - 10 >= i.template.durationScaled.minMin,
    );
    if (long)
      return this.replace(
        long,
        this.materializeItem({ ...long, minutes: long.minutes - 10, shortened: true }),
      );
    const floor = planConfig.plan.minSessionMin;
    const easy = this.scalable().filter((i) => i.floorMin === null);
    for (const i of easy) {
      this.replace(i, {
        ...i,
        floorMin: Math.min(floor, assertDefined(i.template.durationScaled, 'scaled').minMin),
      });
    }
    if (easy.length > 0) return;
    const shortLong = this.items.find(
      (i) => i.role === 'long' && i.template.durationScaled && i.durationMin - 5 >= floor,
    );
    if (shortLong) {
      const minutes = shortLong.durationMin - 5;
      return this.replace(
        shortLong,
        this.materializeItem({ ...shortLong, minutes, floorMin: floor, shortened: true }),
      );
    }
    const shrunk = this.items
      .filter((i) => i.strength !== null && i.durationMin > floor)
      .map(
        (i) => [i, this.materializeItem({ ...i, strengthScale: i.strengthScale * 0.8 })] as const,
      )
      .find(([i, smaller]) => smaller.load < i.load);
    if (shrunk) return this.replace(shrunk[0], shrunk[1]);

    // Last resort: strength or easy sessions go first (by priority), then structured ones become a
    // short easy session (the fill sizes it) so the week stays close to the cap – then the long one.
    const easyFirst = this.input.athlete.profile.strength.priority === 'strengthFirst';
    const rank: Record<SlotRole, number> = {
      easy: easyFirst ? 0 : 1,
      technique: easyFirst ? 0 : 1,
      strength: easyFirst ? 1 : 0,
      key: 2,
      quality: 2,
      brick: 2,
      benchmark: 2,
      long: 3,
    };
    const victim = assertDefined(
      [...this.items].sort((a, b) => rank[a.role] - rank[b.role] || b.order - a.order)[0],
      'victim',
    );
    this.notes.push({ key: 'notes.loadCap' });
    const note = { key: 'notes.loadCapEasy', params: { type: victim.template.type } };
    this.replace(victim, rank[victim.role] >= 2 ? this.toEasy(victim, floor, note) : null);
  }

  /** One step towards 80/20: lower the hardest levelled session, then make a quality session easy. */
  private reduceIntensity(): void {
    const hardSec = (i: Item) =>
      totalDurationSec(flattenSteps(i.warmup, i.main, i.cooldown).filter((s) => s.zone >= 3));
    if (
      this.lowerLevel(
        this.items.filter((i) => hardSec(i) > 0),
        hardSec,
      )
    )
      return;
    // Last placed first, so the key session survives longest.
    const quality = assertDefined(
      [...this.items]
        .sort((a, b) => b.order - a.order)
        .find((i) => hardSec(i) > 0 && i.strength === null),
      'quality',
    );
    const note = { key: 'notes.intensityBalance', params: { type: quality.template.type } };
    this.replace(quality, this.toEasy(quality, quality.durationMin, note));
  }

  // ------------------------------------------------------------------------------------------
  // Output

  private toWorkout(i: Item, index = 0): Workout {
    const day = this.dayAt(i.day);
    const date = toIsoDate(assertDefined(day.day, 'day'));
    return {
      id: `${this.input.idPrefix ?? ''}${date}-${index + 1}`,
      date,
      weekday: day.weekday,
      sport: i.template.sport,
      templateId: i.strength?.templateId.startsWith('routine:')
        ? i.strength.templateId
        : i.template.id,
      type: i.template.type,
      role: i.role,
      intensity: i.intensity,
      hard: this.isHard(i),
      level: i.level,
      durationMin: i.durationMin,
      load: round1(i.load),
      legLoad: i.legLoad,
      target: i.target,
      warmup: i.warmup,
      main: i.main,
      cooldown: i.cooldown,
      terrain: i.terrain,
      exercises: i.exercises,
      whyKey: i.template.whyKey,
      notes: i.notes,
      indoorAlternativeId: i.template.indoorAlternativeId ?? null,
      winterVariant: null,
    };
  }

  private output(): WeekOutput {
    const { input } = this;
    const sorted = [...this.items].sort((a, b) => a.day - b.day || a.order - b.order);
    const workouts = sorted.map((i) => {
      const w = this.toWorkout(i, sorted.filter((o) => o.day === i.day).indexOf(i));
      const month = Number(w.date.slice(5, 7));
      return { ...w, winterVariant: winterVariantFor(w, input.athlete, month, input.raceGoal) };
    });

    const loading = !input.skeleton.isRecovery && this.phase !== 'taper';
    const levels = new Map(input.levels);
    const longMin = { ...input.longMin };
    for (const i of this.items) {
      if (i.level !== null && loading && i.role !== 'benchmark') {
        // +1 level after a planned (assumed completed) session, hold if the load cap lowered it.
        levels.set(
          i.template.id,
          i.lowered ? i.level : Math.min(i.template.levels.length, i.level + 1),
        );
      }
      if (i.role === 'long' && loading && i.template.durationScaled) {
        const sport = i.template.sport as Sport;
        // Shortened by the cap: hold (but never below the template minimum).
        longMin[sport] = i.shortened
          ? Math.max(i.minutes, i.template.durationScaled.minMin)
          : i.minutes + planConfig.long.weeklyIncreaseMin;
      }
    }

    const lastItems = this.itemsOn(6);
    return {
      workouts,
      notes: this.notes,
      load: round1(this.totalLoad()),
      minutes: this.items.reduce((s, i) => s + i.durationMin, 0),
      levels,
      longMin,
      strengthRotation: this.strengthRotation,
      last: {
        hard: lastItems.some((i) => this.isHard(i)),
        heavyLegs: this.dayHeavyLegs(6),
        eccentric: this.dayEccentric(6),
      },
    };
  }
}

function isLongOrKey(role: SlotRole): boolean {
  return role === 'long' || role === 'key' || role === 'brick' || role === 'benchmark';
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let n = from; n >= to; n--) out.push(n);
  return out;
}

/** Synthetic template for a user routine so it runs through the same scheduling rules. */
function routineTemplate(s: StrengthSlot): WorkoutTemplate {
  return {
    id: s.templateId,
    sport: 'strength',
    type: s.type,
    intensity: s.legLoad === 'heavy' ? 'hard' : 'easy',
    phases: ['base', 'build', 'peak', 'taper', 'maintain'],
    levels: [],
    legLoad: s.legLoad,
    whyKey: s.whyKey,
    strength: s.def,
  };
}
