import { describe, expect, it } from 'vitest';

import { isHardEndurance } from './classify';
import { requiredSports } from './composition';
import { planConfig } from './config';
import { grid, type GridCase } from './fixtures';
import { generatePlan } from './generate';
import type { Plan, PlanWeek, Workout } from './types';

/**
 * Property tests over a deterministic grid of goals × experience × availability (with varied
 * terrain, strength modes, pools, doubles, start weekdays and plan lengths). Every rule from
 * CLAUDE.md "Training engine rules" that the generator promises is checked on every plan.
 */

const cases = grid().map((c) => {
  const result = generatePlan(c.profile, { kind: c.goal }, c.availability, c.start, c.target);
  if (!result.ok) throw new Error(`${c.name}: ${JSON.stringify(result.issues)}`);
  return { ...c, plan: result.value };
});

/** Every plan day in order (across weeks) with its workouts. */
function days(plan: Plan): Workout[][] {
  return plan.weeks.flatMap((w) =>
    [0, 1, 2, 3, 4, 5, 6].map((d) => w.workouts.filter((x) => x.weekday === d)),
  );
}

const isLoadingWeek = (w: PlanWeek) => !w.isRecovery && w.phase !== 'taper' && !w.isPartial;
const isHeavyLegs = (w: Workout) => w.sport === 'strength' && w.legLoad === 'heavy';
const isLongOrKey = (w: Workout) => ['long', 'key', 'brick', 'benchmark'].includes(w.role);

function each(name: string, check: (c: GridCase & { plan: Plan }) => void) {
  it(name, () => {
    for (const c of cases) {
      try {
        check(c);
      } catch (e) {
        throw new Error(`${c.name}: ${(e as Error).message}`, { cause: e });
      }
    }
  });
}

describe('generatePlan rules over the fixture grid', () => {
  it('covers the whole grid', () => {
    expect(cases.length).toBeGreaterThan(150);
  });

  each('weekly load never jumps more than 10 % over the previous loading week', ({ plan }) => {
    let reference: number | null = null;
    for (const week of plan.weeks) {
      if (reference !== null) {
        expect(week.load).toBeLessThanOrEqual(
          reference * planConfig.progression.maxWeeklyIncrease + 0.5,
        );
      }
      if (isLoadingWeek(week)) reference = week.load;
    }
  });

  each(
    'has recovery weeks at least every 4th week, clearly below the loading weeks',
    ({ plan, profile }) => {
      const every = profile.age >= 50 ? 3 : 4;
      const loadingRun = plan.weeks.filter((w) => w.phase !== 'taper');
      let sinceRecovery = 0;
      let lastLoading: number | null = null;
      for (const week of loadingRun) {
        if (week.isRecovery) {
          sinceRecovery = 0;
          if (lastLoading !== null) expect(week.load).toBeLessThanOrEqual(lastLoading * 0.75);
        } else {
          sinceRecovery++;
          // The last weeks before the taper may run one longer (no recovery right before the taper).
          expect(sinceRecovery).toBeLessThanOrEqual(every);
        }
        if (isLoadingWeek(week)) lastLoading = week.load;
      }
      if (loadingRun.length > every) expect(loadingRun.some((w) => w.isRecovery)).toBe(true);
    },
  );

  each('never puts heavy legs the day before a long or key session', ({ plan }) => {
    const all = days(plan);
    all.forEach((day, i) => {
      if (day.some(isHeavyLegs)) expect((all[i + 1] ?? []).some(isLongOrKey)).toBe(false);
    });
  });

  each('never puts heavy legs the day after a long descent run', ({ plan }) => {
    const all = days(plan);
    all.forEach((day, i) => {
      if (day.some(isHeavyLegs))
        expect((all[i - 1] ?? []).some((w) => w.terrain?.eccentric === true)).toBe(false);
    });
  });

  each('never exceeds the availability', ({ plan, availability, start, target, goal }) => {
    for (const week of plan.weeks) {
      for (let d = 0; d < 7; d++) {
        const day = week.workouts.filter((w) => w.weekday === d);
        const minutes = day.reduce((s, w) => s + w.durationMin, 0);
        expect(minutes).toBeLessThanOrEqual(availability.minutesPerDay[d] as number);
        expect(day.length).toBeLessThanOrEqual(availability.doublesAllowed ? 2 : 1);
      }
      for (const w of week.workouts) {
        expect(w.date >= start).toBe(true);
        if (target)
          expect(
            ['fitness', 'weightloss'].includes(goal) ? w.date <= target : w.date < target,
          ).toBe(true);
      }
    }
  });

  each('only contains the selected disciplines', ({ plan, profile }) => {
    const allowed = new Set<string>([
      ...profile.sports,
      ...(profile.sports.length >= 2 ? ['brick'] : []),
    ]);
    if (!['none', 'log'].includes(profile.strength.mode)) allowed.add('strength');
    for (const w of plan.weeks.flatMap((x) => x.workouts)) {
      expect(allowed.has(w.sport), `${w.sport} in ${[...allowed].join(',')}`).toBe(true);
      if (w.sport === 'brick') {
        expect(profile.sports.includes('run') && profile.sports.includes('bike')).toBe(true);
      }
    }
  });

  each('never has two hard endurance sessions on one day', ({ plan }) => {
    for (const day of days(plan)) expect(day.filter(isHardEndurance).length).toBeLessThanOrEqual(1);
  });

  each('never puts hard sessions on consecutive days', ({ plan }) => {
    const all = days(plan);
    for (let i = 1; i < all.length; i++) {
      const today = all[i]?.filter((w) => w.hard) ?? [];
      const yesterday = all[i - 1]?.filter((w) => w.hard) ?? [];
      if (today.length > 0 && yesterday.length > 0) {
        throw new Error(`hard on ${yesterday[0]?.date} and ${today[0]?.date}`);
      }
    }
  });

  each('names the reason when a hard session had to be made easy', ({ plan }) => {
    for (const w of plan.weeks.flatMap((x) => x.workouts)) {
      if (w.notes.some((n) => n.key === 'notes.downgraded')) {
        expect(w.hard).toBe(false);
        expect(w.role).toBe('easy');
      }
    }
  });

  each('never repeats the same strength session on consecutive days', ({ plan }) => {
    for (const week of plan.weeks) {
      for (const w of week.workouts.filter((x) => x.sport === 'strength')) {
        const next = week.workouts.filter(
          (x) => x.sport === 'strength' && x.weekday === w.weekday + 1,
        );
        expect(next.map((x) => x.templateId)).not.toContain(w.templateId);
      }
    }
  });

  each('never has hard days back to back (across weeks too)', ({ plan }) => {
    const hard = days(plan).map((day) => day.some((w) => w.hard));
    hard.forEach((h, i) => {
      if (h) expect(hard[i + 1] ?? false).toBe(false);
    });
  });

  each('keeps ~80/20: at most 20 % of endurance time in Z3+', ({ plan }) => {
    for (const week of plan.weeks) {
      expect(week.hardShare).toBeLessThanOrEqual(planConfig.intensity.maxHardShare + 0.001);
    }
  });

  each('tapers: taper weeks are below the last peak week and keep coming down', ({ plan }) => {
    const taper = plan.weeks.filter((w) => w.phase === 'taper');
    const loading = plan.weeks.filter((w) => w.phase !== 'taper' && !w.isRecovery);
    if (taper.length === 0) return;
    const peak = loading.at(-1)?.load ?? Infinity;
    let previous = peak;
    for (const week of taper) {
      expect(week.load).toBeLessThan(previous);
      previous = week.load;
    }
  });

  each('fills the goal disciplines', ({ plan, goal, availability }) => {
    const sports = new Set(
      plan.weeks.flatMap((w) => w.workouts.map((x) => (x.sport === 'brick' ? 'bike' : x.sport))),
    );
    const trainingDays = availability.minutesPerDay.filter((m) => m >= 20).length;
    for (const s of requiredSports(goal)) {
      if (trainingDays >= requiredSports(goal).length) expect(sports.has(s), s).toBe(true);
    }
  });
});

describe('triathlon plans', () => {
  const tri = cases.filter((c) => c.goal.startsWith('tri_'));

  it('contain swim, bike and run every full week', () => {
    for (const c of tri) {
      for (const week of c.plan.weeks.filter((w) => !w.isPartial)) {
        const sports = new Set(week.workouts.map((w) => w.sport));
        expect(
          ['swim', 'bike', 'run'].every((s) => sports.has(s as 'swim')),
          `${c.name} W${week.index + 1}`,
        ).toBe(true);
      }
    }
  });

  it('contain brick sessions in build and peak', () => {
    for (const c of tri) {
      const buildPeak = c.plan.weeks.filter((w) => ['build', 'peak'].includes(w.phase));
      expect(
        buildPeak.flatMap((w) => w.workouts).some((w) => w.sport === 'brick'),
        c.name,
      ).toBe(true);
      expect(
        c.plan.weeks
          .filter((w) => w.phase === 'base')
          .flatMap((w) => w.workouts)
          .some((w) => w.sport === 'brick'),
      ).toBe(false);
    }
  });
});

describe('determinism', () => {
  it('returns the same plan for the same input', () => {
    for (const c of cases.slice(0, 20)) {
      const again = generatePlan(c.profile, { kind: c.goal }, c.availability, c.start, c.target);
      expect(again).toEqual({ ok: true, value: c.plan });
    }
  });
});
