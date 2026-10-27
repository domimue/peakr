import { dayToIso, isoToDay, QUESTION_IDS as Q, STRENGTH_QUESTION_IDS as S } from '@peakr/quiz';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import * as onboardingRepo from '@/data/repositories/onboarding-repository';
import * as strengthRepo from '@/data/repositories/strength-repository';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { localToday, useQuizStore } from '../quiz-store';
import { ForecastScreen } from '../screens/forecast-screen';
import { IntroScreen } from '../screens/intro-screen';
import { QuizScreen } from '../screens/quiz-screen';

jest.mock('@/data/repositories/onboarding-repository');
jest.mock('@/data/repositories/strength-repository');
jest.mock('@/data/repositories/baseline-repository');
jest.mock('@/data/repositories/plan-repository');
jest.mock('@expo/ui/community/datetime-picker', () => ({ DateTimePicker: () => null }));
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  // Rendered outside a navigator in tests.
  useFocusEffect: jest.fn(),
}));

// The in-memory mocks (src/data/repositories/__mocks__).
const progress =
  onboardingRepo as unknown as typeof import('@/data/repositories/__mocks__/onboarding-repository');
const strength =
  strengthRepo as unknown as typeof import('@/data/repositories/__mocks__/strength-repository');

const inDays = (days: number) => dayToIso((isoToDay(localToday()) ?? 0) + days);

beforeEach(() => {
  progress.resetStore();
  strength.resetStore();
  useQuizStore.setState({
    answers: {},
    stepId: null,
    insight: false,
    finished: false,
    hydrated: false,
    direction: 1,
  });
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
  jest.spyOn(router, 'replace').mockImplementation(() => undefined);
  jest.spyOn(router, 'back').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

const next = () => fireEvent.press(screen.getByRole('button', { name: 'Next' }));
const proceed = () => fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

describe('onboarding intro', () => {
  it('says the quiz is free and offers to resume', async () => {
    await renderWithQuery(<IntroScreen />);
    expect(
      screen.getByText('The quiz is free. Your full plan comes with a 7-day free trial.'),
    ).toBeOnTheScreen();
    await fireEvent.press(await screen.findByText('Start the quiz'));
    expect(router.push).toHaveBeenCalledWith('/onboarding/quiz');
  });

  it('resumes saved progress', async () => {
    progress.store.progress = {
      answers: { [Q.goal]: 'fitness' },
      stepId: 'sports',
      insight: false,
      finished: false,
    };
    await renderWithQuery(<IntroScreen />);
    expect(await screen.findByText('Continue where I stopped')).toBeOnTheScreen();
    expect(screen.getByText('Start over')).toBeOnTheScreen();
  });
});

describe('onboarding quiz', () => {
  it('walks through every step with insights and saves the answers', async () => {
    await renderWithQuery(<QuizScreen />);
    expect(await screen.findByText('What’s your goal?')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await fireEvent.press(screen.getByText('Get fitter'));
    await next();
    expect(screen.getByText(/loops build and recovery blocks/)).toBeOnTheScreen();
    // Back from an insight returns to its question.
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(screen.getByText('What’s your goal?')).toBeOnTheScreen();
    await next();
    await proceed();

    expect(screen.getByText('Which sports do you want to train?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Running'));
    await next();
    await fireEvent.press(screen.getByText('No strength'));
    await next();
    await fireEvent.press(screen.getByText('Beginner'));
    await next();

    await fireEvent.press(screen.getByText('I know my 10 km time'));
    await fireEvent.changeText(screen.getByLabelText('Your race time, minutes'), '50');
    await next();
    expect(screen.getByText(/threshold pace is about 5:03 \/km/)).toBeOnTheScreen();
    await proceed();

    // Current training: Peakr's estimate, or the user's own week (no Strava in the quiz).
    expect(screen.getByText('Your current training')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('I enter it'));
    expect(screen.getByText('Kilometres you run per week')).toBeOnTheScreen();
    await next();

    // Heart rate is optional; an impossible value blocks the step.
    await fireEvent.changeText(screen.getByLabelText('Resting heart rate (optional)'), '12');
    expect(screen.getByText('Enter a value between 25 and 120.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Resting heart rate (optional)'), '52');
    // Without age or max HR there is no Zone 2 yet: on to the sessions per sport.
    await next();

    // Sessions per sport, before the days: Peakr suggests by default; "I choose" starts at it.
    expect(screen.getByText('How many sessions a week per sport?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('I choose'));
    expect(screen.getByLabelText('Runs per week: 3 sessions')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Runs per week, Increase'));
    expect(screen.getByLabelText('Runs per week: 4 sessions')).toBeOnTheScreen();
    await next();
    expect(screen.getByText('Peakr plans 4 runs a week.')).toBeOnTheScreen();
    await proceed();

    expect(screen.getByText('How much time do you have each day?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Monday, Increase'));
    expect(screen.getByLabelText('Monday: 15 min')).toBeOnTheScreen();
    await next();
    expect(screen.getByText(/4 training days and up to 4.3 hours/)).toBeOnTheScreen();
    await proceed();

    // Commute: details appear once a way to commute is chosen (defaults: 20 min, workdays).
    expect(screen.getByText('Do you commute actively?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('By bike'));
    expect(screen.getByText('On which days?')).toBeOnTheScreen();
    await next();
    expect(screen.getByText(/about 3.3 h of easy training on 5 days/)).toBeOnTheScreen();
    await proceed();

    await fireEvent.press(screen.getByText('Rolling'));
    await next();
    // Winter sports are optional.
    await fireEvent.press(screen.getByText('Cross-country skiing'));
    await next();
    expect(screen.getByText(/winter variants of your easy and long sessions/)).toBeOnTheScreen();
    await proceed();
    await fireEvent.press(screen.getByText('Stay healthy'));
    await fireEvent.press(screen.getByText('Not enough time'));
    await next();
    expect(screen.getByText(/rebuild a single week in seconds/)).toBeOnTheScreen();
    await proceed();

    await fireEvent.changeText(screen.getByLabelText('Age'), '34');
    await fireEvent.press(screen.getByText('Female'));
    await fireEvent.changeText(screen.getByLabelText('Height'), '168');
    await fireEvent.changeText(screen.getByLabelText('Weight'), '61');
    await next();
    expect(screen.getByText(/Zone 2 is about 126–144 bpm/)).toBeOnTheScreen();
    await proceed();

    expect(screen.getByRole('button', { name: 'See my forecast' })).toBeDisabled();
    await fireEvent.press(
      screen.getByLabelText('I have read this and train at my own responsibility.'),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'See my forecast' }));
    // The (skippable) watch step comes before the forecast.
    expect(router.push).toHaveBeenCalledWith('/onboarding/watch');

    await waitFor(() => expect(progress.store.progress?.finished).toBe(true));
    expect(progress.store.progress?.answers).toMatchObject({
      [Q.goal]: 'fitness',
      [Q.sports]: ['run'],
      [Q.runRaceTime]: 3000,
      [Q.restingHr]: 52,
      [Q.availability]: [15, 45, 0, 45, 0, 90, 60],
      [Q.commuteSport]: 'bike',
      [Q.winterSports]: ['xcski'],
      [Q.age]: 34,
      [Q.disclaimer]: true,
    });
  });

  it('pre-selects all disciplines for a triathlon and asks for the race date', async () => {
    await renderWithQuery(<QuizScreen />);
    await fireEvent.press(await screen.findByText('Olympic triathlon'));
    await next();
    await proceed();
    for (const sport of ['Running', 'Cycling', 'Swimming']) {
      expect(screen.getByRole('checkbox', { name: sport })).toBeChecked();
    }
    // Removing one is not allowed for a triathlon.
    await fireEvent.press(screen.getByText('Swimming'));
    expect(screen.getByText(/needs all of its disciplines/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(useQuizStore.getState().answers[Q.sports]).toEqual(['run', 'bike']);
  });

  it('resumes on the saved step', async () => {
    progress.store.progress = {
      answers: { [Q.goal]: 'half', [Q.sports]: ['run'] },
      stepId: 'experience',
      insight: false,
      finished: false,
    };
    await renderWithQuery(<QuizScreen />);
    expect(
      await screen.findByText('How experienced are you with endurance training?'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(screen.getByText('How do you want to do strength?')).toBeOnTheScreen();
  });
});

describe('forecast', () => {
  it('shows the engine forecast and week 1, and leads to the paywall', async () => {
    progress.store.progress = {
      answers: {
        [Q.goal]: 'half',
        [Q.sports]: ['run'],
        [S.mode]: 'peakr',
        [S.equipment]: 'home',
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
      },
      stepId: 'disclaimer',
      insight: false,
      finished: true,
    };
    await renderWithQuery(<ForecastScreen />);
    expect(await screen.findByText('Your plan is ready')).toBeOnTheScreen();
    expect(screen.getByText(/10 km time predicts 1:50:19 for the Half marathon/)).toBeOnTheScreen();
    expect(screen.getByText('Your first week')).toBeOnTheScreen();
    expect(screen.getAllByText('Long run').length).toBe(1);
    // The easy band from the HR reserve (resting HR 52), independent of the method.
    expect(screen.getAllByText(/Easy · 126–144 bpm \(Zone 2\)/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Taper · 1 week/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Unlock full plan'));
    expect(router.push).toHaveBeenCalledWith('/paywall');
    // The strength answers became the saved setup.
    await waitFor(() =>
      expect(strength.store.setup).toEqual({
        mode: 'peakr',
        equipment: 'home',
        daysPerWeek: 2,
        priority: 'enduranceFirst',
      }),
    );
  });

  it('builds a race plan without a date with the recommended length', async () => {
    progress.store.progress = {
      answers: {
        [Q.goal]: 'marathon',
        [Q.sports]: ['run'],
        [S.mode]: 'none',
        [Q.experience]: 'intermediate',
        [Q.runReference]: 'none',
        [Q.availability]: [0, 60, 45, 60, 0, 120, 45],
        [Q.terrain]: 'flat',
        [Q.why]: ['race'],
        [Q.age]: 40,
        [Q.sex]: 'male',
        [Q.heightCm]: 180,
        [Q.weightKg]: 75,
        [Q.disclaimer]: true,
      },
      stepId: 'disclaimer',
      insight: false,
      finished: true,
    };
    await renderWithQuery(<ForecastScreen />);
    expect(await screen.findByText(/recommended 14 weeks/)).toBeOnTheScreen();
    expect(screen.getByText('14')).toBeOnTheScreen();
    expect(screen.getByText(/Taper · 2 weeks/)).toBeOnTheScreen();
  });

  it('sends incomplete answers back to the quiz', async () => {
    progress.store.progress = {
      answers: { [Q.goal]: 'half' },
      stepId: 'goal',
      insight: false,
      finished: true,
    };
    await renderWithQuery(<ForecastScreen />);
    await fireEvent.press(await screen.findByText('Edit my answers'));
    expect(router.replace).toHaveBeenCalledWith('/onboarding/quiz');
  });
});
