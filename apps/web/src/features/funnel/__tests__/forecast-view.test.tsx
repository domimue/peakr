import { QUESTION_IDS as Q, STRENGTH_QUESTION_IDS as S } from '@peakr/quiz';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ForecastView } from '../forecast-view';
import { funnelPlan } from '../plan';
import { ANSWERS } from './fixtures';

vi.mock('server-only', () => ({}));

/** No raw i18n key may reach the page (every text resolves in the shared files). */
function expectNoRawKeys(text: string) {
  expect(text).not.toMatch(
    /\b(quiz|workouts|workoutText|why|notes|steps|strength|exercises)\.[a-zA-Z]/,
  );
}

describe('ForecastView', () => {
  it('shows the stats, the outcome, week 1 and the trial CTA', () => {
    const result = funnelPlan(ANSWERS, '2026-10-24')!;
    const { container } = render(<ForecastView result={result} />);
    expect(screen.getByRole('heading', { name: 'Your plan is ready' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Your first week' })).toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(result.plan.weeks[0]!.workouts.length);
    expect(
      screen.getByRole('link', { name: 'Start my 7-day free trial' }).getAttribute('href'),
    ).toBe('/quiz/paywall');
    expectNoRawKeys(container.textContent ?? '');
  });

  it('describes strength and multisport weeks without raw keys', () => {
    const answers = {
      ...ANSWERS,
      [Q.goal]: 'tri_sprint',
      [Q.sports]: ['run', 'bike', 'swim'],
      [Q.bikeHours]: 3,
      [Q.bikePowerMeter]: 'no',
      [Q.swimAbility]: 'can100',
      [Q.swimWater]: 'pool25',
      [S.mode]: 'peakr',
      [S.equipment]: 'gym',
      [Q.availability]: [45, 60, 45, 60, 0, 120, 90],
    };
    const result = funnelPlan(answers, '2026-10-24');
    expect(result).not.toBeNull();
    const { container } = render(<ForecastView result={result!} />);
    expectNoRawKeys(container.textContent ?? '');
  });
});
