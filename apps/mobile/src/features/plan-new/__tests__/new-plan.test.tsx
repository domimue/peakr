import { allWorkouts, generatePlan, type Plan } from '@peakr/engine';
import { dayToIso, isoToDay, QUESTION_IDS as Q, STRENGTH_QUESTION_IDS as S } from '@peakr/quiz';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import ProfileScreen from '../../../../app/profile';
import type { StoredPlanInput } from '@/data/db/schema';
import * as ids from '@/data/ids';
import * as baselineRepo from '@/data/repositories/baseline-repository';
import * as onboardingRepo from '@/data/repositories/onboarding-repository';
import * as repo from '@/data/repositories/plan-repository';
import { useBillingStore } from '@/features/billing/billing-store';
import { NO_ENTITLEMENTS } from '@/features/billing/model';
import { localToday, useQuizStore } from '@/features/onboarding/quiz-store';
import { ForecastScreen } from '@/features/onboarding/screens/forecast-screen';
import { TodayScreen } from '@/features/today/today-screen';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { newPlanInput } from '../calibrate';
import { useNewPlanFlow } from '../flow-store';
import { NewPlanConfirmScreen, NewPlanStartScreen } from '../new-plan-screens';
import { prefilledAnswers } from '../start';

jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/route-repository');
jest.mock('@/data/repositories/activity-repository');
jest.mock('@/data/repositories/gym-repository');
jest.mock('@/data/repositories/onboarding-repository');
jest.mock('@/data/repositories/strength-repository');
jest.mock('@/data/repositories/baseline-repository');
jest.mock('@/data/repositories/billing-repository');

const mock = repo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');
const progress =
  onboardingRepo as unknown as typeof import('@/data/repositories/__mocks__/onboarding-repository');
const baseline =
  baselineRepo as unknown as typeof import('@/data/repositories/__mocks__/baseline-repository');

const today = localToday();
const inDays = (days: number) => dayToIso((isoToDay(today) ?? 0) + days);

const answers = {
  [Q.goal]: 'half',
  [Q.sports]: ['run'],
  [S.mode]: 'none',
  [Q.experience]: 'intermediate',
  [Q.runReference]: '10k',
  [Q.runRaceTime]: 3000,
  [Q.restingHr]: 52,
  [Q.availability]: [0, 60, 45, 60, 0, 120, 45],
  [Q.terrain]: 'rolling',
  [Q.targetDate]: inDays(150),
  [Q.why]: ['race'],
  [Q.age]: 34,
  [Q.sex]: 'female',
  [Q.heightCm]: 168,
  [Q.weightKg]: 61,
  [Q.disclaimer]: true,
};

const input: StoredPlanInput = {
  profile: {
    age: 34,
    experience: 'intermediate',
    sports: ['run'],
    terrain: 'rolling',
    strength: { mode: 'none' },
    difficulty: 7,
  },
  goal: { kind: '10k' },
  availability: { minutesPerDay: [60, 60, 45, 60, 0, 120, 90], doublesAllowed: false },
};

/** The current plan started ten weeks ago with everything up to yesterday done. */
function storeCurrent(): Plan {
  const start = inDays(-70);
  const r = generatePlan(input.profile, input.goal, input.availability, start, inDays(40));
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  const done = allWorkouts(r.value).filter((w) => w.date < today);
  mock.store.plan = {
    id: 'plan-old',
    input,
    state: {
      plan: r.value,
      status: Object.fromEntries(done.map((w) => [w.id, 'done' as const])),
      pauses: [],
      revision: 0,
    },
  };
  return r.value;
}

beforeEach(() => {
  mock.resetStore();
  progress.resetStore();
  baseline.resetStore();
  useNewPlanFlow.setState({ active: false, review: {}, acceptDifficulty: true });
  useQuizStore.setState({
    answers: {},
    stepId: null,
    insight: false,
    finished: false,
    hydrated: false,
    direction: 1,
  });
  useBillingStore.setState({
    status: 'ready',
    entitlements: { ...NO_ENTITLEMENTS, tier: 'training' },
    devTraining: false,
  });
  jest.spyOn(ids, 'todayIso').mockReturnValue(today);
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
  jest.spyOn(router, 'replace').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('"Create a new plan" in the same account', () => {
  it('Profile shows the current goal; without a subscription the row leads to the paywall', async () => {
    storeCurrent();
    await renderWithQuery(<ProfileScreen />);
    await fireEvent.press(await screen.findByText('Create a new plan'));
    expect(router.push).toHaveBeenCalledWith('/plan-new');
    expect(screen.getByText('10 km race')).toBeOnTheScreen();

    useBillingStore.setState({ entitlements: { ...NO_ENTITLEMENTS } });
    await renderWithQuery(<ProfileScreen />);
    await fireEvent.press((await screen.findAllByText('Create a new plan')).at(-1) as never);
    expect(router.push).toHaveBeenLastCalledWith('/paywall');
  });

  it('starts the quiz again at the first step with the earlier answers; Strava is read anew', async () => {
    storeCurrent();
    progress.store.progress = { answers, stepId: 'disclaimer', insight: false, finished: true };
    baseline.store.meta = { importedAt: '2026-08-01T00:00:00Z' } as never;
    await renderWithQuery(<NewPlanStartScreen />);
    expect(await screen.findByText('Current plan: 10 km race')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('new-plan-start'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/onboarding/quiz'));
    const quiz = useQuizStore.getState();
    expect(quiz).toMatchObject({ stepId: 'goal', finished: false });
    expect(quiz.answers[Q.goal]).toBe('half');
    // The availability as it is in the plan now (edited in Profile after the quiz).
    expect(quiz.answers[Q.availability]).toEqual([60, 60, 45, 60, 0, 120, 90]);
    expect(baseline.clearBaseline).toHaveBeenCalled();
    expect(useNewPlanFlow.getState().active).toBe(true);
  });

  it('a race date that has passed (or is too close) is asked again', () => {
    const past = prefilledAnswers({ ...answers, [Q.targetDate]: inDays(-3) }, null, today);
    expect(past[Q.targetDate]).toBeUndefined();
    expect(prefilledAnswers(answers, null, today)[Q.targetDate]).toBe(inDays(150));
  });

  it('the start comes from the sessions of the current plan; Profile settings stay', () => {
    storeCurrent();
    const current = mock.store.plan;
    const v = newPlanInput(answers, { activities: [], meta: null }, current, today);
    expect(v?.profile.baseline?.longMin?.run).toBeGreaterThan(0);
    expect(Object.keys(v?.profile.baseline?.levels ?? {}).length).toBeGreaterThan(0);
    expect(v?.profile.difficulty).toBe(7);
    expect(newPlanInput({}, { activities: [], meta: null }, current, today)).toBeNull();
  });

  it('a week the user entered as current training wins over the previous plan', () => {
    storeCurrent();
    const own = { ...answers, [Q.currentMode]: 'own', [Q.runWeeklyKm]: 5 };
    const v = newPlanInput(own, { activities: [], meta: null }, mock.store.plan, today);
    const fromHistory = newPlanInput(
      answers,
      { activities: [], meta: null },
      mock.store.plan,
      today,
    );
    expect(v?.profile.baseline?.weeklyMin?.run).toBeLessThan(
      fromHistory?.profile.baseline?.weeklyMin?.run ?? 0,
    );
  });

  it('forecast → confirmation (no paywall) → the old plan is archived, its sessions kept', async () => {
    const old = storeCurrent();
    progress.store.progress = { answers, stepId: 'disclaimer', insight: false, finished: true };
    useNewPlanFlow.setState({ active: true });
    await renderWithQuery(<ForecastScreen />);
    expect(await screen.findByText('Your next plan')).toBeOnTheScreen();
    expect(screen.queryByText('Unlock full plan')).toBeNull();
    await fireEvent.press(screen.getByText('Continue'));
    expect(router.push).toHaveBeenCalledWith('/plan-new/confirm');

    await renderWithQuery(<NewPlanConfirmScreen />);
    expect(await screen.findByText('Your current plan (10 km race) is archived')).toBeOnTheScreen();
    expect(screen.getByText(/archived as replaced \(not completed\)/)).toBeOnTheScreen();
    expect(screen.getByText('•  Planned sessions from today on')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('new-plan-confirm'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/today'));
    expect(mock.store.plan?.state.plan.goal.kind).toBe('half');
    const archived = mock.store.archive[0];
    expect(archived).toMatchObject({ id: 'plan-old', outcome: 'replaced' });
    const done = allWorkouts(old).filter((w) => w.date < today).length;
    expect(Object.keys(archived?.state.status ?? {})).toHaveLength(done);
    expect(useNewPlanFlow.getState().active).toBe(false);
  });

  it('a plan that ended is archived when Today opens; Today then offers the next plan', async () => {
    const r = generatePlan(input.profile, input.goal, input.availability, inDays(-80), inDays(-2));
    if (!r.ok) throw new Error('plan');
    mock.store.plan = {
      id: 'plan-ended',
      input,
      state: { plan: r.value, status: {}, pauses: [], revision: 0 },
    };
    await renderWithQuery(<TodayScreen />);
    expect(await screen.findByText('Your plan has ended')).toBeOnTheScreen();
    expect(mock.store.archive[0]).toMatchObject({ id: 'plan-ended', outcome: 'finished' });
    await fireEvent.press(screen.getByText('Create a new plan'));
    expect(router.push).toHaveBeenCalledWith('/plan-new');
  });

  it('"How was your last plan?": measured figures, quick taps, every change with its reason', async () => {
    storeCurrent();
    progress.store.progress = { answers, stepId: 'disclaimer', insight: false, finished: true };
    await renderWithQuery(<NewPlanStartScreen />);
    expect(await screen.findByTestId('review-measured')).toBeOnTheScreen();
    expect(screen.getByText(/^\d+ of \d+ sessions · \d+ %$/)).toBeOnTheScreen();
    expect(screen.getByText('Easy pace: not enough linked runs to compare')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Too hard'));
    expect(
      screen.getByText('•  It felt too hard – sessions start one level lower.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('•  Difficulty 7 → 6')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Keep mine'));
    expect(useNewPlanFlow.getState().acceptDifficulty).toBe(false);
    await fireEvent.press(screen.getByText('More intervals'));
    expect(
      screen.getByText(
        '•  More intervals: VO₂ sessions come every second week instead of every third.',
      ),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Yes'));
    expect(
      screen.getByText('If the pain or discomfort persists, talk to a doctor.'),
    ).toBeOnTheScreen();
    expect(useNewPlanFlow.getState().review).toMatchObject({
      overall: 'tooHard',
      wishes: ['moreIntervals'],
      breakForComplaints: true,
    });
    // Tapping the chosen answer again takes it back.
    await fireEvent.press(screen.getByText('Too hard'));
    expect(useNewPlanFlow.getState().review.overall).toBeUndefined();
    await fireEvent.press(screen.getByText('More intervals'));
    expect(useNewPlanFlow.getState().review.wishes).toEqual([]);
  });

  it('the answers shape the new plan and are kept with the archived one; skipping clears them', async () => {
    storeCurrent();
    progress.store.progress = { answers, stepId: 'disclaimer', insight: false, finished: true };
    useQuizStore.setState({ answers, hydrated: true });
    useNewPlanFlow.setState({
      active: true,
      review: { overall: 'tooEasy', wishes: ['moreIntervals'] },
      acceptDifficulty: true,
    });
    await renderWithQuery(<NewPlanConfirmScreen />);
    await fireEvent.press(await screen.findByTestId('new-plan-confirm'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/today'));
    expect(mock.store.plan?.input.profile).toMatchObject({
      difficulty: 8,
      qualityEmphasis: 'more',
    });
    expect(mock.store.archive[0]?.review).toMatchObject({
      answers: { overall: 'tooEasy', wishes: ['moreIntervals'] },
      acceptDifficulty: true,
    });

    useNewPlanFlow.setState({ active: false, review: { overall: 'right' } });
    await renderWithQuery(<NewPlanStartScreen />);
    await fireEvent.press(await screen.findByTestId('new-plan-skip-review'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/onboarding/quiz'));
    expect(useNewPlanFlow.getState().review).toEqual({});
  });
});
