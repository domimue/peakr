import { describe, expect, it } from 'vitest';

import { funnelPlan, funnelToday } from '../plan';
import { ANSWERS } from './fixtures';

describe('funnelPlan', () => {
  it('builds the plan, the forecast and the zones from the answers', () => {
    const result = funnelPlan(ANSWERS, '2026-10-24');
    expect(result).not.toBeNull();
    expect(result!.plan.startDate).toBe('2026-10-26');
    expect(result!.forecast.weeks).toBe(result!.plan.weeks.length);
    expect(result!.plan.weeks[0]!.workouts.length).toBeGreaterThan(0);
    expect(result!.hrZones).toHaveLength(5);
  });

  it('returns null for incomplete answers', () => {
    expect(funnelPlan({ goal: '10k' }, '2026-10-24')).toBeNull();
  });
});

describe('funnelToday', () => {
  const now = new Date('2026-10-24T12:00:00Z');
  it('keeps the local quiz date when it is (about) today', () => {
    expect(funnelToday('2026-10-25', now)).toBe('2026-10-25');
    expect(funnelToday('2026-10-24', now)).toBe('2026-10-24');
  });

  it('uses the server date for an old quiz or none', () => {
    expect(funnelToday('2026-10-01', now)).toBe('2026-10-24');
    expect(funnelToday(null, now)).toBe('2026-10-24');
  });
});
