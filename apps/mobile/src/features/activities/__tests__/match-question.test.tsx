import { generatePlan, statusOf } from '@peakr/engine';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { notifyActivities } from '@/data/activities/events';
import type { StoredPlanInput } from '@/data/db/schema';
import * as activityRepo from '@/data/repositories/activity-repository';
import * as planRepo from '@/data/repositories/plan-repository';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { ActivityNoticeHost } from '../activity-notice';
import { MatchQuestionCards } from '../match-question-card';

jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/activity-repository');
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const plans = planRepo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');
const activities =
  activityRepo as unknown as typeof import('@/data/repositories/__mocks__/activity-repository');

const input: StoredPlanInput = {
  profile: {
    age: 35,
    experience: 'intermediate',
    sports: ['run'],
    terrain: 'flat',
    strength: { mode: 'none' },
  },
  goal: { kind: 'half' },
  availability: { minutesPerDay: [60, 60, 45, 60, 0, 120, 90], doublesAllowed: false },
  targetDate: '2027-02-14',
  hrZones: { age: 35 },
};

beforeEach(() => {
  plans.resetStore();
  activities.resetStore();
  const r = generatePlan(input.profile, input.goal, input.availability, '2026-10-19', '2027-02-14');
  if (!r.ok) throw new Error('plan');
  plans.store.plan = {
    id: 'plan-1',
    input,
    state: { plan: r.value, status: {}, pauses: [], revision: 0 },
  };
  activities.applyActivities(
    [
      {
        source: 'strava',
        externalId: '1',
        sport: 'run',
        startTime: '2026-10-26T06:00:00Z',
        date: '2026-10-26',
        durationSec: 3900,
        distanceM: 12_000,
        elevationGainM: 20,
        avgHr: null,
        maxHr: null,
        swimPaceSecPer100m: null,
        polyline: null,
        name: null,
        indoor: false,
        commute: false,
        summary: false,
        rpe: null,
      },
    ],
    [],
  );
});

const mondayRun = () =>
  plans.store.plan?.state.plan.weeks[1]?.workouts.find((w) => w.date === '2026-10-26');

describe('which session was this?', () => {
  it('offers the plausible sessions and "none of these"; picking one marks it done', async () => {
    const monday = mondayRun();
    activities.store.questions = [
      {
        activityKey: 'strava:1',
        planId: 'plan-1',
        candidates: [{ workoutId: monday?.id as string, score: 0.62 }],
        sport: 'run',
        date: '2026-10-26',
        durationSec: 3900,
        distanceM: 12_000,
        source: 'strava',
      },
    ];
    await renderWithQuery(<MatchQuestionCards />);
    expect(await screen.findByText('Which session was this?')).toBeOnTheScreen();
    expect(
      screen.getByText(/Run on Monday · 65 min · 12 km – synced from Strava/),
    ).toBeOnTheScreen();
    expect(screen.getByText('None of these')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(/Easy run · Monday · \d+ min/));
    await waitFor(() => expect(activities.store.questions).toEqual([]));
    expect(statusOf(plans.store.plan?.state as never, monday?.id as string)).toBe('done');
    expect(activities.store.links).toEqual([
      { activityKey: 'strava:1', workoutId: monday?.id, planId: 'plan-1' },
    ]);
  });

  it('the synced notice of an automatic link has an undo', async () => {
    const monday = mondayRun();
    await renderWithQuery(<ActivityNoticeHost />);
    await act(async () =>
      notifyActivities([
        {
          kind: 'matched',
          sport: 'run',
          source: 'strava',
          date: '2026-10-26',
          workoutId: monday?.id as string,
          activityKey: 'strava:1',
          wasDone: false,
          adjusted: 0,
        },
      ]),
    );
    expect(await screen.findByText(/session marked as done/)).toBeOnTheScreen();
    await fireEvent.press(await screen.findByTestId('activity-undo'));
    await waitFor(() => expect(activities.store.questions).toHaveLength(1));
    expect(activities.removeLink).toHaveBeenCalledWith('strava:1');
  });
});
