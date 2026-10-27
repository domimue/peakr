import { assertDefined } from '../result';
import { planConfig } from './config';
import {
  SPORTS,
  type GoalKind,
  type Phase,
  type PlanNote,
  type SlotRole,
  type Sport,
  type UserProfile,
} from './types';

const sessions = planConfig.sessions;

/** One session the week should contain, in fill priority order (WORKOUTS.md §9). */
export interface Slot {
  role: SlotRole;
  sport: Sport | 'brick';
  templateId: string;
  /** Levelled sessions: this many levels below the current one (taper openers, short VO2). */
  levelDrop?: number;
  /** Levelled sessions: never above this level (light quality for fitness goals). */
  maxLevel?: number;
  note?: PlanNote;
  /** Placed instead when this slot does not fit (benchmark → the normal key session). */
  fallback?: Slot;
  /** Needed to hold the start floor of its sport: placed before strength. */
  floor?: boolean;
}

export type GoalFamily = 'run' | 'bike' | 'swim' | 'multisport' | 'fitness';

export function goalFamily(goal: GoalKind): GoalFamily {
  switch (goal) {
    case '5k':
    case '10k':
    case 'half':
    case 'marathon':
      return 'run';
    case 'granfondo':
      return 'bike';
    case 'swim':
      return 'swim';
    case 'fitness':
    case 'weightloss':
      return 'fitness';
    default:
      return 'multisport';
  }
}

/** Disciplines a goal needs (triathlon: all three). Fitness goals accept any combination. */
export function requiredSports(goal: GoalKind): Sport[] {
  const family = goalFamily(goal);
  if (family === 'fitness') return [];
  if (family === 'multisport')
    return goal === 'duathlon' ? ['bike', 'run'] : ['swim', 'bike', 'run'];
  return [family];
}

/**
 * Share of endurance time per selected discipline: goal split (triathlon 20/45/35, duathlon) or
 * the goal sport with `primaryShare` and the rest evenly; fitness goals split evenly. Time moves
 * from the strongest to the weakest discipline if one is named.
 */
export function sportShares(goal: GoalKind, profile: UserProfile): Record<Sport, number> {
  const cfg = planConfig.multisport;
  const required = requiredSports(goal);
  const extra = profile.sports.filter((s) => !required.includes(s));
  const shares: Record<Sport, number> = { run: 0, bike: 0, swim: 0 };
  const requiredTotal = required.length === 0 ? 0 : extra.length === 0 ? 1 : cfg.primaryShare;
  const base: Partial<Record<Sport, number>> =
    goal === 'duathlon' ? cfg.split.duathlon : required.length === 3 ? cfg.split.tri : {};
  for (const s of required) shares[s] = (base[s] ?? 1) * requiredTotal;
  for (const s of extra) shares[s] = (1 - requiredTotal) / extra.length;

  const weakest = profile.weakestSport;
  if (weakest && shares[weakest] > 0) {
    const strongest = (Object.keys(shares) as Sport[]).reduce((a, b) =>
      shares[b] > shares[a] ? b : a,
    );
    if (strongest !== weakest) {
      const shift = Math.min(cfg.weakestShift, shares[strongest]);
      shares[strongest] -= shift;
      shares[weakest] += shift;
    }
  }
  return shares;
}

export interface CompositionContext {
  goal: GoalKind;
  profile: UserProfile;
  phase: Phase;
  /** 0-based plan week. */
  weekIndex: number;
  isRecovery: boolean;
  /** True in the last week of the taper (race week). */
  raceWeek: boolean;
  /** Days with at least the minimum session length. */
  trainingDays: number;
  /**
   * Sessions per sport a new plan needs to hold what the athlete already does with the minutes of
   * their days (start floors): three 45-minute days cannot hold 150 minutes, four can.
   */
  floorSessions?: Partial<Record<Sport, number>>;
  /** CSS sets allowed (400 m continuous, technique-first for beginners done). */
  cssAllowed: boolean;
  /** Replace key sessions with benchmark tests this week. */
  benchmark: boolean;
  /** 0-based count of build/peak weeks so far (brick cadence for sprint triathlons). */
  buildWeekIndex: number;
  /** 0-based count of build/peak loading weeks so far, recovery weeks not counted (run quality rotation). */
  qualityIndex: number;
}

const slot = (
  role: SlotRole,
  sport: Sport | 'brick',
  templateId: string,
  extra: Partial<Slot> = {},
): Slot => ({
  role,
  sport,
  templateId,
  ...extra,
});

export const EASY_TEMPLATE: Record<Sport | 'brick', string> = {
  run: 'run.easy',
  bike: 'bike.endurance',
  swim: 'swim.aerobic',
  brick: 'bike.endurance',
};

const repeat = (n: number, s: Slot): Slot[] => Array.from({ length: Math.max(0, n) }, () => s);

function runTemplates(ctx: CompositionContext) {
  const { phase, weekIndex, goal, profile, qualityIndex: q } = ctx;
  const flat = profile.terrain === 'flat';
  const odd = weekIndex % 2 === 1;
  const hilly = profile.terrain === 'hilly' || profile.terrain === 'mountainous';
  const vo2Ready = weekIndex >= 4;
  const vo2 = vo2Ready ? (hilly ? 'run.vo2_intervals_time' : 'run.vo2_intervals') : 'run.tempo';
  const marathonish = goal === 'half' || goal === 'marathon';
  const strides = phase !== 'base' || weekIndex + 1 >= sessions.stridesFromWeek;
  // Threshold work: tempo, every other loading week long hills in Build (not on flat terrain).
  const threshold = phase === 'build' && !flat && q % 2 === 1 ? 'run.hills_long' : 'run.tempo';
  const rotation = sessions.qualityRotation;
  // More intervals: VO2 more often – for the 5K, whose turn brings threshold work, less often.
  const emphasis = profile.qualityEmphasis ?? 'balanced';
  const shift = emphasis === 'balanced' ? 0 : (emphasis === 'more') === (goal === '5k') ? 1 : -1;
  const base = goal === 'half' && phase === 'peak' ? rotation.halfPeakEvery : rotation.every;
  const every = Math.max(2, base + shift);
  // The rotation counts loading weeks only (recovery weeks keep the slot of the week after).
  const vo2Turn = q % every === every - 1;
  return {
    marathonish,
    vo2,
    vo2Turn,
    threshold,
    easy: slot('easy', 'run', 'run.easy'),
    strides: slot('easy', 'run', strides ? 'run.easy_strides' : 'run.easy'),
    fartlekOrHills: slot('key', 'run', !flat && odd ? 'run.hills_short' : 'run.fartlek'),
    tempo: slot('key', 'run', threshold),
    racePace: goal === 'half' ? 'run.race_pace_hm' : 'run.race_pace_m',
    long: slot('long', 'run', 'run.long'),
  };
}

/**
 * The quality sessions of a running week (WORKOUTS.md §9 "Quality rotation"): the key session
 * (placed with the long run, kept longest) and the second one (dropped first when the days or the
 * 80/20 balance cannot hold it). On a rotation turn the distance's other kind of quality moves
 * into the key slot, so threshold and VO2 work both appear every few loading weeks even when only
 * one quality session fits. With one quality session a week only the key session is used.
 */
function runQuality(ctx: CompositionContext, t: ReturnType<typeof runTemplates>): [Slot, Slot] {
  const { goal, phase } = ctx;
  const build = phase === 'build';
  // A VO2 set that does not fit the day (warm-up and cool-down make it the longest quality run)
  // becomes threshold work rather than an easy run.
  const vo2 = (role: SlotRole, extra: Partial<Slot> = {}) =>
    slot(role, 'run', t.vo2, { ...extra, fallback: slot(role, 'run', t.threshold) });
  const threshold = (role: SlotRole) => slot(role, 'run', t.threshold);
  const fartlek = slot('quality', 'run', 'run.fartlek');
  switch (goal) {
    case '5k':
      // VO2 is the main quality; threshold every third week (Build: fartlek as the second).
      return t.vo2Turn
        ? [threshold('key'), build ? fartlek : vo2('quality')]
        : [vo2('key'), threshold('quality')];
    case '10k':
      return t.vo2Turn
        ? [vo2('key'), build ? fartlek : threshold('quality')]
        : [threshold('key'), vo2('quality')];
    default: {
      // HM / marathon: threshold, the race-specific session second; a VO2 set on the turn (one
      // level shorter for the marathon and in half-marathon Peak).
      const specific = slot('quality', 'run', build ? 'run.progression' : t.racePace);
      const short = goal === 'marathon' || phase === 'peak' ? { levelDrop: 1 } : {};
      return [t.vo2Turn ? vo2('key', short) : threshold('key'), specific];
    }
  }
}

function runGoalSlots(ctx: CompositionContext, n: number): Slot[] {
  const t = runTemplates(ctx);
  const easyCount = (fixed: number) => repeat(n - fixed, t.easy);
  const [key, second] = runQuality(ctx, t);
  switch (ctx.phase) {
    case 'base':
      return [t.long, t.fartlekOrHills, t.strides, ...easyCount(3)];
    case 'build':
      if (n <= 3) return [t.long, key, t.easy];
      if (n === 4) return [t.long, key, t.easy, t.strides];
      return [t.long, key, second, t.strides, ...easyCount(4)];
    case 'peak':
      if (n <= 3) {
        // HM/M: the long run at race pace is the week's second quality – except in VO2 weeks,
        // where an easy long run leaves room in the 20 % for the intervals.
        return [
          t.marathonish && !t.vo2Turn ? slot('long', 'run', t.racePace) : t.long,
          key,
          t.easy,
        ];
      }
      return [t.long, key, second, ...easyCount(3)];
    default: {
      // Taper: short sharp session, strides, short easy runs; race week drops the long run. The
      // half marathon keeps tempo until race week, then a short VO2 opener; the marathon stays at
      // tempo.
      const sharpId =
        ctx.goal === 'marathon' || (ctx.goal === 'half' && !ctx.raceWeek) ? 'run.tempo' : t.vo2;
      const sharp = slot('key', 'run', sharpId, { levelDrop: 2 });
      if (ctx.raceWeek) return [sharp, t.strides, ...repeat(n - 3, t.easy)];
      return [t.long, sharp, t.strides, ...easyCount(3)];
    }
  }
}

function bikeGoalSlots(ctx: CompositionContext, n: number): Slot[] {
  const { phase, weekIndex, profile } = ctx;
  const odd = weekIndex % 2 === 1;
  const climbOk = profile.terrain !== 'flat';
  const long = slot('long', 'bike', 'bike.long');
  const endurance = slot('easy', 'bike', 'bike.endurance');
  const fill = (fixed: number) => repeat(n - fixed, endurance);
  const opener = slot('key', 'bike', 'bike.vo2', { levelDrop: 2 });
  switch (phase) {
    case 'base':
      return [
        long,
        slot('key', 'bike', odd ? 'bike.tempo' : 'bike.sweetspot'),
        slot('easy', 'bike', 'bike.cadence'),
        ...fill(3),
      ];
    case 'build':
      return [
        long,
        slot('key', 'bike', 'bike.threshold'),
        slot('quality', 'bike', climbOk && odd ? 'bike.climb' : 'bike.vo2'),
        ...fill(3),
      ];
    case 'peak':
      return [
        long,
        slot('key', 'bike', climbOk && odd ? 'bike.climb' : 'bike.threshold'),
        slot('quality', 'bike', 'bike.vo2', { levelDrop: 1 }),
        slot('easy', 'bike', 'bike.recovery'),
        ...fill(4),
      ];
    default:
      if (ctx.raceWeek) return [opener, endurance];
      return [long, opener, ...fill(2)];
  }
}

function swimSlots(ctx: CompositionContext, n: number): Slot[] {
  const key = slot('key', 'swim', ctx.cssAllowed ? 'swim.css' : 'swim.technique');
  const technique = slot('technique', 'swim', 'swim.technique');
  const aerobic = slot('easy', 'swim', 'swim.aerobic');
  const fill = (fixed: number) => repeat(n - fixed, aerobic);
  const speed = slot('quality', 'swim', 'swim.speed');
  switch (ctx.phase) {
    case 'base':
      return [key, technique, aerobic, ...fill(3)];
    case 'build':
      return [key, speed, aerobic, technique, ...fill(4)];
    case 'peak': {
      const ow = ctx.profile.poolLength === 'openwater';
      return [
        key,
        speed,
        ow ? slot('quality', 'swim', 'swim.openwater') : aerobic,
        technique,
        ...fill(4),
      ];
    }
    default:
      return [
        slot('key', 'swim', 'swim.speed', { levelDrop: 2 }),
        technique,
        ...repeat(n - 2, aerobic),
      ];
  }
}

function multisportSlots(ctx: CompositionContext): Slot[] {
  const { phase, goal, isRecovery, buildWeekIndex } = ctx;
  const tri = goal !== 'duathlon';
  const shares = sportShares(goal, ctx.profile);
  const t = runTemplates(ctx);
  const buildOrPeak = phase === 'build' || phase === 'peak';
  const brickWeek =
    buildOrPeak &&
    !isRecovery &&
    (goal !== 'tri_sprint' || buildWeekIndex % sessions.sprintBrickEvery === 0);
  const taper = phase === 'taper';
  const drop = taper ? { levelDrop: 2 } : {};

  const bikeKey = brickWeek
    ? slot('brick', 'brick', 'brick')
    : slot(
        'key',
        'bike',
        phase === 'base' ? 'bike.sweetspot' : taper ? 'bike.vo2' : 'bike.threshold',
        drop,
      );
  const runKey =
    phase === 'base'
      ? t.fartlekOrHills
      : slot('key', 'run', taper ? 'run.tempo' : t.tempo.templateId, drop);
  const swimKey = slot(
    'key',
    'swim',
    taper ? 'swim.speed' : ctx.cssAllowed ? 'swim.css' : 'swim.technique',
    drop,
  );

  // Priority: brick (needs the biggest day), long sessions, then one key session per discipline.
  const longs = ctx.raceWeek ? [] : [slot('long', 'bike', 'bike.long'), t.long];
  const keys = [...(tri ? [swimKey] : []), ...(brickWeek ? [] : [bikeKey]), runKey];
  const easies: Slot[] = [
    ...(tri ? [slot('technique', 'swim', 'swim.technique')] : []),
    t.strides,
    slot('easy', 'bike', phase === 'base' ? 'bike.cadence' : 'bike.endurance'),
  ];
  if (!taper) {
    if (shares.run >= 0.35) easies.push(t.easy);
    easies.push(slot('easy', 'bike', 'bike.endurance'));
    if (tri) easies.push(slot('easy', 'swim', 'swim.aerobic'));
  }
  return [...(brickWeek ? [bikeKey] : []), ...longs, ...keys, ...easies];
}

function fitnessSlots(ctx: CompositionContext, n: number): Slot[] {
  const { profile, weekIndex } = ctx;
  const sports = profile.sports;
  const longSport =
    profile.longSessionSport && sports.includes(profile.longSessionSport)
      ? profile.longSessionSport
      : sports.includes('run')
        ? 'run'
        : assertDefined(sports[0], 'sport');
  const long =
    longSport === 'swim'
      ? slot('long', 'swim', 'swim.aerobic')
      : slot('long', longSport, `${longSport}.long`);
  const result: Slot[] = [long];

  if (weekIndex + 1 >= sessions.fitnessQualityFromWeek) {
    const sport = assertDefined(sports[weekIndex % sports.length], 'sport');
    const templateId =
      sport === 'run'
        ? weekIndex % 2 === 0
          ? 'run.fartlek'
          : 'run.tempo'
        : sport === 'bike'
          ? 'bike.sweetspot'
          : ctx.cssAllowed
            ? 'swim.css'
            : 'swim.technique';
    result.push(slot('key', sport, templateId, { maxLevel: sessions.fitnessQualityMaxLevel }));
  }

  // Easy sessions round-robin over the selected sports, starting after the long-session sport.
  const order = [...sports.filter((s) => s !== longSport), longSport];
  for (let i = 0; result.length < n; i++) {
    const sport = assertDefined(order[i % order.length], 'sport');
    result.push(
      slot(
        'easy',
        sport,
        sport === 'swim' && i % 2 === 1 ? 'swim.technique' : EASY_TEMPLATE[sport],
      ),
    );
  }
  return result;
}

/** Replaces the key session of each tested discipline with its benchmark (WORKOUTS.md §7). */
function withBenchmarks(slots: Slot[], ctx: CompositionContext, raceGoal: boolean): Slot[] {
  const tests: Partial<Record<Sport, string>> = {
    run: raceGoal ? 'bench.run_5k' : 'bench.run_30min',
    ...(ctx.profile.hasPowerMeter ? { bike: 'bench.bike_ftp20' } : {}),
    ...(ctx.cssAllowed ? { swim: 'bench.swim_css' } : {}),
  };
  const done = new Set<string>();
  return slots.map((s) => {
    const test = s.sport === 'brick' ? undefined : tests[s.sport];
    if (s.role !== 'key' || !test || done.has(s.sport)) return s;
    done.add(s.sport);
    return slot('benchmark', s.sport, test, { note: { key: 'notes.benchmark' }, fallback: s });
  });
}

/**
 * The week's sessions in fill priority order (long → key → second quality → easy). Strength is
 * added by the scheduler; the scheduler drops what does not fit the availability.
 */
export function composeWeek(ctx: CompositionContext, raceGoal: boolean): Slot[] {
  const family = goalFamily(ctx.goal);
  const n = Math.min(sessions.perWeek[ctx.profile.experience], ctx.trainingDays);
  let slots: Slot[];
  if (family === 'run') slots = runGoalSlots(ctx, n);
  else if (family === 'bike') slots = bikeGoalSlots(ctx, n);
  else if (family === 'swim') slots = swimSlots(ctx, n);
  else if (family === 'multisport') slots = multisportSlots(ctx);
  else slots = fitnessSlots(ctx, n);

  if (family !== 'multisport' && family !== 'fitness') {
    slots = slots.slice(0, Math.max(n, 2));
    // Cross-training: one easy session per other selected discipline.
    for (const sport of ctx.profile.sports) {
      if (sport !== family)
        slots.push(slot('easy', sport, sport === 'swim' ? 'swim.technique' : EASY_TEMPLATE[sport]));
    }
  }
  if (!ctx.raceWeek) slots = withFloorSessions(withWantedSessions(slots, ctx), ctx);
  return ctx.benchmark ? withBenchmarks(slots, ctx, raceGoal) : slots;
}

/**
 * The sessions per discipline the user asked for: the lowest-priority ones of a sport go when
 * there are too many (long and key sessions stay longest, bricks always), easy ones are added when
 * there are too few. The start floors still apply on top.
 */
function withWantedSessions(slots: Slot[], ctx: CompositionContext): Slot[] {
  const want = ctx.profile.sessionsPerWeek;
  if (!want) return slots;
  const out = [...slots];
  for (const sport of ctx.profile.sports) {
    const wanted = want[sport];
    if (wanted === undefined) continue;
    const count = () => out.filter((s) => s.sport === sport).length;
    while (count() > wanted) {
      out.splice(out.map((s) => s.sport === sport).lastIndexOf(true), 1);
    }
    while (count() < wanted) {
      out.push(slot('easy', sport, sport === 'swim' ? 'swim.aerobic' : EASY_TEMPLATE[sport]));
    }
  }
  return out;
}

/**
 * Sessions per discipline in a normal week of a new plan – what Peakr suggests when the user
 * leaves the number open (the quiz shows it as the starting value).
 */
export function suggestedSessions(goal: GoalKind, profile: UserProfile): Record<Sport, number> {
  const slots = composeWeek(
    {
      goal,
      profile: { ...profile, sessionsPerWeek: undefined },
      phase: 'base',
      weekIndex: 0,
      isRecovery: false,
      raceWeek: false,
      trainingDays: 7,
      cssAllowed: true,
      benchmark: false,
      buildWeekIndex: 0,
      qualityIndex: 0,
    },
    false,
  );
  // A base week has no bricks (they start in Build).
  const counts = { run: 0, bike: 0, swim: 0 };
  for (const s of slots.filter((x): x is Slot & { sport: Sport } => x.sport !== 'brick')) {
    counts[s.sport]++;
  }
  return counts;
}

/**
 * Never fewer sessions of a sport than it takes to hold what the athlete already does (start
 * floors): easy sessions are added, as many as there are days. The load fill sizes them.
 */
function withFloorSessions(slots: Slot[], ctx: CompositionContext): Slot[] {
  const want = ctx.floorSessions;
  if (!want) return slots;
  let out = [...slots];
  for (const sport of SPORTS) {
    const need = want[sport] ?? 0;
    if (need === 0) continue;
    const ofSport = (s: Slot) => s.sport === sport || (s.sport === 'brick' && sport !== 'swim');
    for (let i = out.filter(ofSport).length; i < need; i++) {
      const add = slot('easy', sport, sport === 'swim' ? 'swim.aerobic' : EASY_TEMPLATE[sport]);
      if (out.length < ctx.trainingDays) {
        out.push(add);
        continue;
      }
      // No day left: an easy session of a sport with more than its own floor needs makes room.
      const isSpare = (s: Slot) =>
        s.role === 'easy' &&
        !s.floor &&
        s.sport !== sport &&
        s.sport !== 'brick' &&
        out.filter((x) => x.sport === s.sport).length > (want[s.sport] ?? 0);
      const spare = out.map(isSpare).lastIndexOf(true);
      if (spare < 0) break;
      out[spare] = add;
    }
    // The sessions that hold the floor go before strength (the others keep their place).
    let counted = 0;
    out = out.map((s) => {
      if (!ofSport(s) || counted >= need) return s;
      counted++;
      return s.role === 'easy' || s.role === 'technique' ? { ...s, floor: true } : s;
    });
  }
  return out;
}
