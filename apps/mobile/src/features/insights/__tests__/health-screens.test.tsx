import { generatePlan, type HealthMetric } from '@peakr/engine';
import type { Session } from '@supabase/supabase-js';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import type { StoredPlanInput } from '@/data/db/schema';
import * as ids from '@/data/ids';
import * as healthRepo from '@/data/repositories/health-repository';
import * as planRepo from '@/data/repositories/plan-repository';
import { useSessionStore } from '@/features/auth/session-store';
import * as api from '@/features/health-data/api';
import en from '@/i18n/locales/en.json';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { TodayScreen } from '@/features/today/today-screen';

import { HealthConsentScreen } from '../health/consent-screen';
import { MetricDetailScreen } from '../health/metric-detail-screen';
import { InsightsScreen } from '../insights-screen';

jest.mock('@/data/supabase', () => ({ supabase: {} }));
jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/baseline-repository');
jest.mock('@/data/repositories/activity-repository');
jest.mock('@/data/repositories/route-repository');
jest.mock('@/features/health-data/api', () => ({
  fetchHealthStatus: jest.fn(),
  fetchHealthRows: jest.fn(async () => ({ rows: [], cursor: null, more: false })),
  requestHealthSync: jest.fn(async () => undefined),
  saveConsents: jest.fn(async (groups: Record<string, boolean>) =>
    Object.keys(groups).filter((g) => groups[g]),
  ),
  deleteServerHealthData: jest.fn(async () => true),
  connectPersonalKey: jest.fn(async () => null),
  disconnectPersonalKey: jest.fn(async () => true),
}));
jest.mock('@/config/feature-flags', () => ({
  isEnabled: (flag: string) => flag === 'garminPersonalKey',
}));
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  Stack: { Screen: () => null },
  useLocalSearchParams: jest.fn(() => ({ metric: 'resting_hr' })),
}));

const health =
  healthRepo as unknown as typeof import('@/data/repositories/__mocks__/health-repository');
const plans = planRepo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');

const TODAY = '2026-10-23';

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const status = (p: Partial<api.HealthStatus> = {}): api.HealthStatus => ({
  connection: {
    status: 'active',
    delivery: 'pull',
    backfillDays: 365,
    provides: ['sleep_duration', 'sleep_score', 'hrv_night', 'resting_hr', 'steps', 'spo2_avg'],
    developerKey: true,
  },
  groups: ['sleep', 'hrv_rhr', 'spo2_resp'],
  sync: { earliestDay: '2026-03-01', backfillDone: true, lastPulledAt: null, lastError: null },
  offers: { oauth: false, personalKey: true },
  ...p,
});

/** `days` days of history before today around `center` plus today's value. */
function history(
  metric: HealthMetric,
  center: number,
  days: number,
  today?: number,
  detail?: Record<string, unknown>,
) {
  for (let i = 1; i <= days; i++) {
    health.store.rows.push({
      metric,
      day: addDays(TODAY, -i),
      source: 'garmin',
      value: center + ((i % 3) - 1),
      detail: detail ?? null,
      recordedAt: `${addDays(TODAY, -i)}T06:30:00.000Z`,
      sourceIds: [`${metric}-${i}`],
    });
  }
  if (today !== undefined) {
    health.store.rows.push({
      metric,
      day: TODAY,
      source: 'garmin',
      value: today,
      detail: detail ?? null,
      recordedAt: `${TODAY}T06:30:00.000Z`,
      sourceIds: [`${metric}-0`],
    });
  }
}

beforeEach(() => {
  health.resetStore();
  plans.resetStore();
  jest.spyOn(ids, 'todayIso').mockReturnValue(TODAY);
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
  jest.mocked(api.fetchHealthStatus).mockResolvedValue(status());
  useSessionStore.setState({
    session: { user: { id: 'u1', is_anonymous: false } } as unknown as Session,
    isAnonymous: false,
    ready: true,
  });
});

afterEach(() => {
  useSessionStore.setState({ session: null, isAnonymous: false });
});

describe('Insights → Health overview', () => {
  it('opens on Health once connected and shows values against the own baseline', async () => {
    history('resting_hr', 50, 30, 58);
    history('sleep_duration', 450, 5, 440, {
      deepMin: 80,
      lightMin: 250,
      remMin: 90,
      awakeMin: 20,
      bedTime: '23:05',
      wakeTime: '06:45',
    });
    await renderWithQuery(<InsightsScreen />);
    expect(await screen.findByTestId('health-overview')).toBeOnTheScreen();
    expect(screen.getByText('58 bpm')).toBeOnTheScreen();
    expect(screen.getByText('Well above your usual range')).toBeOnTheScreen();
    expect(screen.getByText('7 h 20 min')).toBeOnTheScreen();
    expect(
      screen.getByText('Your usual range appears after 14 days with data (5 so far)'),
    ).toBeOnTheScreen();
    expect(screen.getAllByText(/^Garmin · /).length).toBeGreaterThan(0);
    expect(screen.getByText(/^Data from March 1, 2026 on$/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('health-tile-resting_hr'));
    expect(router.push).toHaveBeenCalledWith('/health/resting_hr');
  });

  it('says why a metric is missing', async () => {
    await renderWithQuery(<InsightsScreen />);
    expect(await screen.findByTestId('health-overview')).toBeOnTheScreen();
    // Enabled and provided, but nothing recorded.
    expect(
      screen.getByLabelText(/^Blood oxygen \(SpO2\): Nothing recorded in the last 7 days/),
    ).toBeOnTheScreen();
    // Enabled, but this connection does not deliver it.
    expect(
      screen.getByLabelText('Respiration: Your connected sources do not provide this.'),
    ).toBeOnTheScreen();
    // Groups that are off are listed once each.
    const off = screen.getByTestId('health-not-enabled');
    expect(off).toHaveTextContent(/Turn on "Daily activity"/);
    expect(off).toHaveTextContent(/Turn on "Body composition"/);
  });

  it('invites to set up health data without any source and stays on Training', async () => {
    jest.mocked(api.fetchHealthStatus).mockResolvedValue(status({ connection: null, groups: [] }));
    await renderWithQuery(<InsightsScreen />);
    expect(
      await screen.findByText('Your progress appears here once you have a plan.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Health'));
    await fireEvent.press(await screen.findByText('Set up health data'));
    expect(router.push).toHaveBeenCalledWith('/health/consent');
  });

  it('explains when the connection has no history before connecting', async () => {
    jest.mocked(api.fetchHealthStatus).mockResolvedValue(
      status({
        connection: {
          ...status().connection!,
          delivery: 'push',
          backfillDays: 0,
          developerKey: false,
        },
      }),
    );
    await renderWithQuery(<InsightsScreen />);
    expect(
      await screen.findByText(
        'Data starts on the day you connected – this Garmin connection does not deliver older days.',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Sync now')).toBeNull();
  });
});

const planInput: StoredPlanInput = {
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

describe('Health detail', () => {
  it('resting HR: chart, baseline, consult line when clearly off, hard sessions behind it', async () => {
    const r = generatePlan(
      planInput.profile,
      planInput.goal,
      planInput.availability,
      '2026-10-05',
      '2027-02-14',
    );
    if (!r.ok) throw new Error('plan');
    const hard = r.value.weeks.flatMap((w) => w.workouts).find((w) => w.hard && w.date < TODAY);
    if (!hard) throw new Error('no hard session');
    plans.store.plan = {
      id: 'p',
      input: planInput,
      state: { plan: r.value, status: { [hard.id]: 'done' }, pauses: [], revision: 0 },
    };
    history('resting_hr', 50, 40, 58);
    await renderWithQuery(<MetricDetailScreen />);
    expect(await screen.findByTestId('health-detail-summary')).toHaveTextContent(/58 bpm/);
    expect(screen.getByText(/^Your usual range: /)).toBeOnTheScreen();
    expect(screen.getByTestId('health-consult')).toHaveTextContent(
      'If this keeps up, talk to a doctor.',
    );
    expect(
      screen.getByLabelText(
        /^Line chart of Resting heart rate over 30 days: 30 values, latest 58 bpm\.$/,
      ),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('hard-sessions')).toHaveTextContent(
      /Dips and rises often follow hard training/,
    );
    await fireEvent.press(screen.getByText('7 days'));
    expect(screen.getByLabelText(/over 7 days: 7 values/)).toBeOnTheScreen();
  });

  it('sleep: stages, bed and wake time and the week', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ metric: 'sleep_duration' });
    history('sleep_duration', 450, 6, 445, {
      deepMin: 80,
      lightMin: 255,
      remMin: 90,
      awakeMin: 20,
      bedTime: '23:05',
      wakeTime: '06:45',
    });
    await renderWithQuery(<MetricDetailScreen />);
    const night = await screen.findByTestId('sleep-night');
    expect(night).toHaveTextContent(/Deep 1 h 20 min/);
    expect(night).toHaveTextContent(/REM 1 h 30 min/);
    expect(night).toHaveTextContent(/In bed 23:05 · awake 06:45/);
    expect(screen.getByTestId('sleep-week')).toBeOnTheScreen();
    expect(screen.getAllByLabelText(/: 7 h \d+ min$/)).toHaveLength(7);
  });

  it('weight shows body composition from the scale', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ metric: 'weight' });
    history('weight', 72, 3, 72.4);
    history('body_fat', 15, 1);
    await renderWithQuery(<MetricDetailScreen />);
    // Several queries resolve one after the other here; give a loaded CI machine time.
    await waitFor(
      () => expect(screen.getByTestId('body-composition')).toHaveTextContent(/Body fat.*%/),
      {
        timeout: 5000,
      },
    );
  });
});

describe('Today: recovery line', () => {
  function planWithSessionToday() {
    const r = generatePlan(
      planInput.profile,
      planInput.goal,
      planInput.availability,
      '2026-10-05',
      '2027-02-14',
    );
    if (!r.ok) throw new Error('plan');
    const session = r.value.weeks
      .flatMap((w) => w.workouts)
      .find(
        (w) =>
          w.date >= TODAY &&
          w.role !== 'commute' &&
          (w.intensity === 'hard' || w.intensity === 'moderate'),
      );
    if (!session) throw new Error('no session');
    plans.store.plan = {
      id: 'p',
      input: planInput,
      state: { plan: r.value, status: {}, pauses: [], revision: 0 },
    };
    jest.spyOn(ids, 'todayIso').mockReturnValue(session.date);
    return session;
  }

  /** History before `day` and the value on `day` itself. */
  function around(day: string, metric: HealthMetric, center: number, value: number) {
    for (let i = 0; i <= 30; i++) {
      const d = addDays(day, -i);
      health.store.rows.push({
        metric,
        day: d,
        source: 'garmin',
        value: i === 0 ? value : center + ((i % 3) - 1),
        detail: null,
        recordedAt: `${d}T06:30:00.000Z`,
        sourceIds: [`${metric}-${d}`],
      });
    }
  }

  it('shows the measured difference and eases the session only after confirming', async () => {
    const session = planWithSessionToday();
    around(session.date, 'resting_hr', 50, 58);
    await renderWithQuery(<TodayScreen />);
    const card = await screen.findByTestId(`recovery-line-${session.id}`);
    expect(card).toHaveTextContent(/Resting heart rate 8 bpm above your baseline/);
    expect(card).toHaveTextContent(/If this keeps up, talk to a doctor\./);
    await fireEvent.press(screen.getByText('Make today easier'));
    expect(screen.getByText('Make today easier?')).toBeOnTheScreen();
    expect(plans.savePlanState).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Make it easier'));
    expect(await screen.findByText("Today's session is now easier.")).toBeOnTheScreen();
    expect(plans.savePlanState).toHaveBeenCalled();
  });

  it('says nothing while the values are within the usual range', async () => {
    const session = planWithSessionToday();
    around(session.date, 'resting_hr', 50, 51);
    await renderWithQuery(<TodayScreen />);
    expect(await screen.findByText(/Today/)).toBeOnTheScreen();
    expect(screen.queryByTestId(`recovery-line-${session.id}`)).toBeNull();
  });
});

describe('Health data settings', () => {
  it("lists every group with what is read, women's health off, and saves the choice", async () => {
    await renderWithQuery(<HealthConsentScreen />);
    expect(await screen.findByText('Overnight HRV, resting heart rate')).toBeOnTheScreen();
    expect(screen.getByText(/Cycle tracking data\. Off unless you switch it on/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Daily activity'));
    await fireEvent.press(screen.getByText('Sleep'));
    await fireEvent.press(screen.getByTestId('health-consent-save'));
    await waitFor(() =>
      expect(api.saveConsents).toHaveBeenCalledWith({
        sleep: false,
        hrv_rhr: true,
        stress: false,
        activity: true,
        spo2_resp: true,
        body_comp: false,
        womens_health: false,
      }),
    );
    expect(await screen.findByText('Saved')).toBeOnTheScreen();
  });

  it('deletes all health data after a confirmation, keeping the account', async () => {
    history('resting_hr', 50, 3);
    await renderWithQuery(<HealthConsentScreen />);
    const deleteButtons = await screen.findAllByText('Delete all health data');
    await fireEvent.press(deleteButtons[deleteButtons.length - 1]!);
    await fireEvent.press(screen.getByText('Delete health data'));
    expect(await screen.findByText('Health data deleted.')).toBeOnTheScreen();
    expect(api.deleteServerHealthData).toHaveBeenCalled();
    expect(health.store.rows).toEqual([]);
  });

  it('offers the developer key only behind the flag and reports a rejected key', async () => {
    jest.mocked(api.fetchHealthStatus).mockResolvedValue(status({ connection: null }));
    jest.mocked(api.connectPersonalKey).mockResolvedValueOnce('invalid_key');
    await renderWithQuery(<HealthConsentScreen />);
    expect(await screen.findByTestId('garmin-developer-key')).toBeOnTheScreen();
    expect(
      screen.getByText('Garmin health data arrives once Garmin has approved Peakr.'),
    ).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Personal API key'), 'abc-123-def-456-ghi');
    await fireEvent.press(screen.getByText('Connect key'));
    expect(await screen.findByText('Garmin did not accept this key.')).toBeOnTheScreen();
  });
});

describe('Health texts', () => {
  it('never use diagnostic or alarming words', () => {
    const banned =
      /\b(ill|illness|sick|disease|disorder|diagnos\w*|risk|danger\w*|infection|fever|overtrain\w*|unhealthy|abnormal|warning|symptom\w*|condition|covid|flu|apnea|arrhythmia|afib)\b/i;
    const walk = (node: unknown, path: string): string[] =>
      typeof node === 'string'
        ? banned.test(node)
          ? [`${path}: ${node}`]
          : []
        : Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
            walk(v, `${path}.${k}`),
          );
    expect(walk(en.health, 'health')).toEqual([]);
  });
});
