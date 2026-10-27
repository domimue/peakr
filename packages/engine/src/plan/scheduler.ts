import { assertDefined } from '../result';
import { isHardOnItsOwn } from './classify';
import { commuteSession, commutesOn } from './commute';
import { composeWeek, EASY_TEMPLATE, type CompositionContext, type Slot } from './composition';
import { planConfig } from './config';
import { difficultyFactor } from './difficulty';
import { startFloors } from './floors';
import { toIsoDate } from './dates';
import { rpe, time } from './library/helpers';
import { getTemplate } from './library';
import { clampLevel, recoveryWeekLevel, sportExperience, startLevel } from './levels';
import { enduranceLoad, flattenSteps, hardShare, round1, totalDurationSec } from './load';
import { materialize, materializeStrength, type Athlete } from './materialize';
import type { WeekSkeleton } from './periodisation';
import { adaptToEquipment } from './strength-equipment';
import { planStrengthWeek, type StrengthSlot } from './strength-plan';
import { replacementSport, timeBased } from './travel';
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
  TravelPeriod,
  Weekday,
  Workout,
  WorkoutTemplate,
  WorkoutTerrain,
} from './types';
import { winterVariantFor } from './winter';
import { describeWorkout } from './workout-type';

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
  /** Away (blocked in a week override): no training and no commute. */
  away?: boolean;
  /** Travel mode on this day. */
  travel?: TravelPeriod | null;
}

/** What the scheduler needs to know about the last day of the previous week. */
export interface PrevDay {
  hard: boolean;
  heavyLegs: boolean;
  eccentric: boolean;
}

export const RESTED: PrevDay = { hard: false, heavyLegs: false, eccentric: false };

/** The Monday after the week, when only this week is rebuilt and the next one stays. */
export interface NextDay {
  hard: boolean;
  longOrKey: boolean;
}

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
  /** The following Monday, if it is already planned (single-week rebuild). */
  next?: NextDay;
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
  /** Strength on a travel day: bodyweight / hotel-room exercises only. */
  hotel: boolean;
  commuteId: string | null;
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

    this.placeCommutes();
    first.forEach((s) => this.placeSlot(s));
    if (strengthFirst) this.placeStrength();
    second.forEach((s) => this.placeSlot(s));
    if (!strengthFirst) this.placeStrength();
    rest.forEach((s) => this.placeSlot(s));

    this.settleLoad();
    this.applyTravel();
    return this.output();
  }

  // ------------------------------------------------------------------------------------------
  // Placement

  /** Commutes first, on their weekdays (not on days away or while travelling). */
  private placeCommutes(): void {
    const { profile } = this.input.athlete;
    this.input.days.forEach((day, d) => {
      if (day.day === null || day.away || day.travel) return;
      for (const c of commutesOn(profile, day.weekday)) {
        const session = commuteSession(c);
        if (session.durationMin > this.freeMinutes(d)) {
          // A day without any minutes is a day off – nothing to say.
          if (day.minutes > 0)
            this.notes.push({ key: 'notes.commuteNoRoom', params: { weekday: day.weekday } });
          continue;
        }
        const item = this.newItem('commute', session.template, {});
        this.items.push({
          ...item,
          day: d,
          minutes: session.durationMin,
          floorMin: session.durationMin,
          durationMin: session.durationMin,
          load: session.load,
          main: session.main,
          target: session.target,
          commuteId: c.id,
        });
      }
    });
  }

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
      hotel: false,
      commuteId: null,
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
      input.levels.get(template.id) ??
      input.athlete.profile.baseline?.levels?.[template.id] ??
      startLevel(sportExperience(input.athlete.profile, template.sport), template);
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
    // The floor (what the athlete already does) beats the goal's cap and the default start.
    const floor = startFloors(input.athlete.profile).longMin[sport] ?? 0;
    const cap = Math.max(caps[input.composition.goal] ?? caps.default, floor);
    const next = input.longMin[sport];
    let minutes = Math.min(
      cap,
      next ??
        Math.max(
          floor,
          input.athlete.profile.baseline?.longMin?.[sport] ??
            cfg.startMin[sport][sportExperience(input.athlete.profile, sport)],
        ),
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
    // First with the soft rules (strength keeps the same muscles apart, hard sessions avoid heavy
    // commute days), then without them if nothing fits.
    return [false, true].some((relaxed) => this.placeOn(item, levels, relaxed));
  }

  private placeOn(item: Item, levels: (number | null)[], relaxed: boolean): boolean {
    for (const level of levels) {
      let best: { day: number; score: number } | null = null;
      for (let d = 0; d < 7; d++) {
        const trial = this.trial(item, level, d);
        if (!trial || !this.canPlace(trial, d) || this.strengthClash(trial, d, relaxed)) continue;
        if (!relaxed && this.isHard(trial) && this.heavyCommuteDay(d)) continue;
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
    let t = this.materializeItem({ ...item, level, hotel: Boolean(day.travel) }, minutes);
    // Strength sessions are shortened (fewer sets) to fit a short day, down to 40 % volume.
    while (item.strength && t.durationMin > free && t.strengthScale > 0.4) {
      t = this.materializeItem({ ...t, strengthScale: t.strengthScale * 0.8 });
    }
    return t.durationMin <= free ? t : null;
  }

  private materializeItem(item: Item, minutes = item.minutes): Item {
    if (item.strength) {
      const s = item.hotel ? hotelSlot(item.strength) : item.strength;
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
        const def = assertDefined(template.strength, 'strength');
        r = materializeStrength(
          item.hotel ? adaptToEquipment(def, 'none', 'hotel').def : def,
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

  /** Training sessions of the day – commutes are transport, not one of them. */
  private sessionsOn(d: number): Item[] {
    return this.itemsOn(d).filter((i) => i.commuteId === null);
  }

  private heavyCommuteDay(d: number): boolean {
    const minutes = this.itemsOn(d)
      .filter((i) => i.commuteId !== null)
      .reduce((sum, i) => sum + i.durationMin, 0);
    return minutes >= planConfig.commute.heavyDayMin;
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
    const count = this.sessionsOn(d).length;
    if (day.day === null || day.away || count >= (this.input.doubles ? MAX_SESSIONS_PER_DAY : 1))
      return false;
    return day.minutes - this.usedMinutes(d) >= minutes;
  }

  /** Hard for spacing: §11, and `moderate` for beginners (it becomes hard next to a hard day). */
  private isHard(i: Item): boolean {
    return (
      isHardOnItsOwn({ ...i, sport: i.template.sport, templateType: i.template.type }) ||
      (this.beginner && i.intensity === 'moderate')
    );
  }

  private dayHard(d: number): boolean {
    if (d < 0) return this.input.prev.hard;
    if (d === this.input.raceDayIndex) return true;
    if (d > 6) return this.input.next?.hard === true;
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
    if (d > 6) return this.input.next?.longOrKey === true;
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
    const existing = this.sessionsOn(d);
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
        // Only commutes left above the cap: they stay (real life), the week ends over the cap.
        if (!this.reduceForCap()) return;
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
   * Commutes are never touched; false when nothing else is left to reduce.
   */
  private reduceForCap(): boolean {
    if (this.lowerLevel(this.items, (i) => i.load)) return true;
    const long = this.items.find(
      (i) =>
        i.role === 'long' &&
        i.template.durationScaled &&
        i.minutes - 10 >= i.template.durationScaled.minMin,
    );
    if (long) {
      this.replace(
        long,
        this.materializeItem({ ...long, minutes: long.minutes - 10, shortened: true }),
      );
      return true;
    }
    const floor = planConfig.plan.minSessionMin;
    const easy = this.scalable().filter((i) => i.floorMin === null);
    for (const i of easy) {
      this.replace(i, {
        ...i,
        floorMin: Math.min(floor, assertDefined(i.template.durationScaled, 'scaled').minMin),
      });
    }
    if (easy.length > 0) return true;
    const shortLong = this.items.find(
      (i) => i.role === 'long' && i.template.durationScaled && i.durationMin - 5 >= floor,
    );
    if (shortLong) {
      const minutes = shortLong.durationMin - 5;
      this.replace(
        shortLong,
        this.materializeItem({ ...shortLong, minutes, floorMin: floor, shortened: true }),
      );
      return true;
    }
    const shrunk = this.items
      .filter((i) => i.strength !== null && i.durationMin > floor)
      .map(
        (i) => [i, this.materializeItem({ ...i, strengthScale: i.strengthScale * 0.8 })] as const,
      )
      .find(([i, smaller]) => smaller.load < i.load);
    if (shrunk) {
      this.replace(shrunk[0], shrunk[1]);
      return true;
    }

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
      commute: 4,
    };
    const victim = this.items
      .filter((i) => i.commuteId === null)
      .sort((a, b) => rank[a.role] - rank[b.role] || b.order - a.order)[0];
    if (!victim) return false;
    this.notes.push({ key: 'notes.loadCap' });
    const note = { key: 'notes.loadCapEasy', params: { type: victim.template.type } };
    this.replace(victim, rank[victim.role] >= 2 ? this.toEasy(victim, floor, note) : null);
    return true;
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
  // Travel mode (CLAUDE.md "Irregular weeks & travel")

  /**
   * On travel days runs become time-based (no known routes), and rides, swims and bricks without
   * a bike / pool at the location become an available alternative of equivalent load – never
   * longer than the original (so it fits the day) and always easy (spacing stays intact). With no
   * alternative the session is dropped. Strength was already planned with hotel equipment.
   */
  private applyTravel(): void {
    for (const item of [...this.items]) {
      const travel = this.dayAt(item.day).travel;
      if (!travel || item.commuteId !== null || item.strength !== null) continue;
      const sport = item.template.sport as Sport | 'brick';
      if (sport === 'run') {
        this.replace(item, this.timeBasedRun(item));
        continue;
      }
      const taken = this.sessionsOn(item.day)
        .filter((i) => i.order !== item.order)
        .map((i) => i.template.sport);
      const alternative = replacementSport(sport, travel, this.input.athlete.profile.sports, taken);
      if (alternative === sport) continue;
      if (alternative === null) {
        this.notes.push({ key: 'notes.travelDropped', params: { type: item.template.type } });
        this.replace(item, null);
        continue;
      }
      const perMin = planConfig.load.zoneWeights[2] * planConfig.load.sportFactors[alternative];
      const minutes = Math.min(
        item.durationMin,
        planConfig.travel.maxReplacementMin,
        Math.max(planConfig.plan.minSessionMin, Math.round(item.load / perMin / 5) * 5),
      );
      let replaced = this.materializeItem({
        ...item,
        role: 'easy',
        template: getTemplate(EASIER_TEMPLATE[alternative]),
        level: null,
        minutes,
        floorMin: minutes,
        notes: [
          ...item.notes,
          { key: 'notes.travelReplaced', params: { type: item.template.type, sport: alternative } },
        ],
      });
      if (alternative === 'run') replaced = this.timeBasedRun(replaced);
      this.replace(item, replaced);
    }
  }

  /** A run by time only: no distances, no route (so no climbing load). */
  private timeBasedRun(item: Item): Item {
    const warmup = timeBased(item.warmup);
    const cooldown = timeBased(item.cooldown);
    const main = item.main.map((b) => ({ ...b, steps: timeBased(b.steps) }));
    return {
      ...item,
      warmup,
      main,
      cooldown,
      terrain: null,
      load: round1(enduranceLoad(flattenSteps(warmup, main, cooldown), 'run')),
    };
  }

  // ------------------------------------------------------------------------------------------
  // Output

  private toWorkout(i: Item, index = 0): Workout {
    const day = this.dayAt(i.day);
    const date = toIsoDate(assertDefined(day.day, 'day'));
    return describeWorkout({
      id: `${this.input.idPrefix ?? ''}${date}-${index + 1}`,
      date,
      weekday: day.weekday,
      sport: i.template.sport,
      templateId: i.strength?.templateId.startsWith('routine:')
        ? i.strength.templateId
        : i.template.id,
      templateType: i.template.type,
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
      notes: i.hotel ? [...i.notes, { key: 'notes.travelStrength' }] : i.notes,
      indoorAlternativeId: i.template.indoorAlternativeId ?? null,
      winterVariant: null,
      ...(i.commuteId === null ? {} : { commuteId: i.commuteId }),
      ...(day.travel ? { travel: true } : {}),
    });
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
          : i.minutes +
            Math.round(
              planConfig.long.weeklyIncreaseMin *
                difficultyFactor(input.athlete.profile.difficulty),
            );
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

/** The strength slot with hotel-room equipment (bodyweight and bands) and the home duration. */
function hotelSlot(s: StrengthSlot): StrengthSlot {
  const adapted = adaptToEquipment(s.def, s.legLoad, 'hotel');
  return {
    ...s,
    def: adapted.def,
    legLoad: adapted.legLoad,
    durationFactor: Math.min(s.durationFactor, planConfig.strength.homeDurationFactor),
  };
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
