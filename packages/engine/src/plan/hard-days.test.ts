import { describe, expect, it } from 'vitest';

import { generatePlan } from './generate';
import type { Availability, Plan, UserProfile } from './types';

/** CLAUDE.md "No hard days back to back" – the generator side (the move side is in edit.test). */

const runner: UserProfile = {
  age: 35,
  experience: 'advanced',
  sports: ['run'],
  terrain: 'flat',
  strength: { mode: 'none', equipment: 'none' },
};

function plan(availability: Availability): Plan {
  const result = generatePlan(runner, { kind: 'marathon' }, availability, '2026-10-19', '2027-04-18');
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

const hardDates = (p: Plan) =>
  [...new Set(p.weeks.flatMap((w) => w.workouts.filter((x) => x.hard).map((x) => x.date)))].sort();

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

describe('generatePlan – no hard days back to back', () => {
  it('downgrades a quality session with a reason when only consecutive days are free', () => {
    // Saturday and Sunday only: long run and a key session cannot both stay hard.
    const p = plan({ minutesPerDay: [0, 0, 0, 0, 0, 90, 120], doublesAllowed: false });
    const hard = hardDates(p);
    for (let i = 1; i < hard.length; i++) {
      expect(dayNumber(hard[i] as string) - dayNumber(hard[i - 1] as string)).toBeGreaterThan(1);
    }
    const downgraded = p.weeks
      .flatMap((w) => w.workouts)
      .filter((w) => w.notes.some((n) => n.key === 'notes.downgraded'));
    expect(downgraded.length).toBeGreaterThan(0);
    for (const w of downgraded) {
      expect(w.hard).toBe(false);
      expect(w.notes.find((n) => n.key === 'notes.downgraded')?.params?.type).toBeTruthy();
    }
  });

  it('keeps hard sessions apart when the week has room', () => {
    const p = plan({ minutesPerDay: [60, 60, 60, 60, 60, 90, 150], doublesAllowed: false });
    expect(p.weeks.flatMap((w) => w.workouts).some((w) => w.hard)).toBe(true);
    const hard = hardDates(p);
    for (let i = 1; i < hard.length; i++) {
      expect(dayNumber(hard[i] as string) - dayNumber(hard[i - 1] as string)).toBeGreaterThan(1);
    }
  });
});
