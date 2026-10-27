import { allWorkouts, generatePlan } from '@peakr/engine';
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';

import type { ActivityNotice } from '@/data/activities/apply';
import type { StoredPlanInput } from '@/data/db/schema';
import * as planRepo from '@/data/repositories/plan-repository';
import * as settingsRepo from '@/data/repositories/settings-repository';
import i18n from '@/i18n';

import { congratsFor, congratsText, congratulate } from '../congrats';

jest.mock('@/data/repositories/plan-repository');

const plan = planRepo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');
const settings =
  settingsRepo as unknown as typeof import('@/data/repositories/__mocks__/settings-repository');
const schedule = Notifications.scheduleNotificationAsync as jest.Mock;

const START = '2026-10-19';
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
  hrZones: { age: 35, restingHr: 55 },
};

function storePlan() {
  const r = generatePlan(input.profile, input.goal, input.availability, START, '2027-02-14');
  if (!r.ok) throw new Error('plan');
  plan.store.plan = {
    id: 'plan-1',
    input,
    state: { plan: r.value, status: {}, pauses: [], revision: 0 },
  };
  return allWorkouts(r.value);
}

const matched = (over: Partial<ActivityNotice> = {}): ActivityNotice => ({
  kind: 'matched',
  sport: 'run',
  source: 'strava',
  date: START,
  workoutId: 'w1',
  activityKey: 'strava:1',
  wasDone: false,
  distanceM: 14_200,
  adjusted: 0,
  ...over,
});

const t = i18n.t.bind(i18n);
const setAppState = (value: string) =>
  Object.defineProperty(AppState, 'currentState', { value, configurable: true, writable: true });

beforeEach(() => {
  plan.resetStore();
  settings.resetStore();
  schedule.mockClear();
  setAppState('background');
});

describe('congratsFor', () => {
  it('takes confident links only – no question, no unplanned activity', () => {
    const notices: ActivityNotice[] = [
      matched(),
      { ...matched({ workoutId: undefined }), kind: 'question' },
      { ...matched({ workoutId: undefined }), kind: 'unplanned' },
    ];
    expect(congratsFor(notices, new Set(), START).map((n) => n.workoutId)).toEqual(['w1']);
  });

  it('sends at most one per session and none for one already marked done', () => {
    expect(congratsFor([matched()], new Set(['w1']), START)).toEqual([]);
    expect(
      congratsFor([matched(), matched({ activityKey: 'garmin:1' })], new Set(), START),
    ).toHaveLength(1);
    expect(congratsFor([matched({ wasDone: true })], new Set(), START)).toEqual([]);
  });

  it('leaves older sessions of a first sync alone', () => {
    expect(congratsFor([matched({ date: '2026-10-17' })], new Set(), START)).toEqual([]);
    expect(congratsFor([matched({ date: '2026-10-18' })], new Set(), START)).toHaveLength(1);
  });
});

describe('congratsText', () => {
  it('names the session, the day and the distance', () => {
    expect(congratsText(t, 'Long run', matched(), 'metric', 'en', START)).toEqual({
      title: 'Nice work',
      body: 'Long run today is done – 14.2 km.',
    });
    expect(
      congratsText(t, 'Easy run', matched({ distanceM: null }), 'metric', 'en', '2026-10-20').body,
    ).toBe('Easy run on Monday is done.');
  });
});

describe('congratulate', () => {
  it('schedules one notification per newly linked session and remembers it', async () => {
    const [first] = storePlan();
    const notice = matched({ workoutId: first!.id, date: first!.date });
    jest.useFakeTimers({
      now: new Date(`${first!.date}T18:00:00`),
      doNotFake: ['nextTick', 'setImmediate'],
    });
    try {
      await congratulate([notice]);
      await congratulate([notice]);
    } finally {
      jest.useRealTimers();
    }
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0][0].content.data).toEqual({
      type: 'congrats',
      workoutId: first!.id,
    });
    expect(settings.store.congratsSent).toEqual([first!.id]);
  });

  it('is off when the user turned it off', async () => {
    const [first] = storePlan();
    settings.store.reminder = { ...settings.store.reminder, congrats: false };
    await congratulate([matched({ workoutId: first!.id, date: first!.date })]);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('shows nothing while the app is open, but counts the session as congratulated', async () => {
    const [first] = storePlan();
    setAppState('active');
    jest.useFakeTimers({
      now: new Date(`${first!.date}T18:00:00`),
      doNotFake: ['nextTick', 'setImmediate'],
    });
    try {
      await congratulate([matched({ workoutId: first!.id, date: first!.date })]);
    } finally {
      jest.useRealTimers();
    }
    expect(schedule).not.toHaveBeenCalled();
    expect(settings.store.congratsSent).toEqual([first!.id]);
  });
});
