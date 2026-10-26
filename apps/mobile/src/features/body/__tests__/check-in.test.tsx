import { generatePlan } from '@peakr/engine';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Text } from 'react-native';

import { useRemoteFlagsStore } from '@/config/remote-flags';
import type { StoredPlanInput } from '@/data/db/schema';
import * as ids from '@/data/ids';
import * as bodyRepo from '@/data/repositories/body-repository';
import * as planRepo from '@/data/repositories/plan-repository';
import { useSessionStore } from '@/features/auth/session-store';
import { useBillingStore } from '@/features/billing/billing-store';
import { entitlementsOf, subscriptionsOf, type CustomerInfoLike } from '@/features/billing/model';
import { useReminderExtras } from '@/features/notifications/reminder-extras';
import { shareFile } from '@/features/sharing/share-file';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { historyDays } from '../check-in-data';
import { BodyCheckInReminder, checkInReminderPlan } from '../check-in-reminder';
import { exportBodyData } from '../export';
import { useBodyModel } from '../model';
import { BodyScreen } from '../screens/body-screen';
import { CheckInFormScreen } from '../screens/check-in-form-screen';
import { CheckInRhythmScreen } from '../screens/check-in-rhythm-screen';
import { PhotoCompareScreen } from '../screens/photo-compare-screen';

jest.mock('expo-router', () => {
  const { Text: RNText } = jest.requireActual('react-native');
  return {
    ...jest.requireActual('expo-router'),
    useLocalSearchParams: jest.fn(() => ({})),
    Redirect: ({ href }: { href: string }) => <RNText>{`redirect:${href}`}</RNText>,
  };
});
jest.mock('@/features/sharing/share-file', () => ({
  shareFile: jest.fn(async () => 'shared'),
}));
jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/billing-repository');

const body = bodyRepo as unknown as typeof import('@/data/repositories/__mocks__/body-repository');
const plan = planRepo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');

/** A Monday – the default measuring day. */
const TODAY = '2026-10-26';

function billing(state: 'active' | 'expired') {
  const e = {
    productIdentifier: 'peakr_body',
    store: 'PLAY_STORE',
    periodType: 'NORMAL',
    willRenew: state === 'active',
    expirationDate: state === 'active' ? '2026-12-01T00:00:00Z' : '2026-10-01T00:00:00Z',
  };
  const info: CustomerInfoLike = {
    entitlements: {
      active: state === 'active' ? { body_nutrition: e } : {},
      all: { body_nutrition: e },
    },
    managementURL: null,
  };
  useRemoteFlagsStore.setState({ flags: { addon_body_nutrition: true }, loaded: true });
  useBillingStore.setState({
    status: 'ready',
    entitlements: entitlementsOf(info),
    subscriptions: subscriptionsOf(info),
    devBody: false,
    cachedAddon: null,
  });
}

const weighIn = (id: string, day: string, weightKg: number, createdAt = `${day}T07:00:00Z`) => ({
  id,
  day,
  weightKg,
  waistCm: null,
  bodyFatPct: null,
  note: null,
  createdAt,
});

const checkIn = (
  id: string,
  day: string,
  values: Record<string, number>,
  extra: Partial<bodyRepo.Measurement> = {},
): bodyRepo.Measurement => ({
  id,
  day,
  values,
  bodyFatPct: null,
  bodyFatSource: null,
  note: null,
  photos: {},
  createdAt: `${day}T07:00:00Z`,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  body.resetStore();
  billing('active');
  body.store.profile = { sex: 'male', birthDate: '1990-05-01', heightCm: 180, weightKg: 80 };
  jest.spyOn(ids, 'todayIso').mockReturnValue(TODAY);
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
  jest.spyOn(router, 'back').mockImplementation(() => undefined);
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  useReminderExtras.setState({ lines: {} });
});

afterEach(() => jest.restoreAllMocks());

async function openCheckInSection() {
  await renderWithQuery(<BodyScreen initial="checkIn" />);
  return screen.findByTestId('body-check-in');
}

describe('weigh-ins', () => {
  it('allows several weigh-ins a day and warns about an implausible jump', async () => {
    body.store.checkIns = [weighIn('w0', '2026-10-25', 80)];
    await openCheckInSection();
    expect(screen.getByText('No weigh-in today.')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId('weigh-in-weight'), '79,6');
    await fireEvent.press(screen.getByText('Save weight'));
    await waitFor(() => expect(body.store.checkIns).toHaveLength(2));
    await fireEvent.changeText(screen.getByTestId('weigh-in-weight'), '79.4');
    await fireEvent.press(screen.getByText('Save weight'));
    await waitFor(() => expect(body.store.checkIns).toHaveLength(3));
    expect(body.store.checkIns.filter((c) => c.day === TODAY).map((c) => c.weightKg)).toEqual([
      79.6, 79.4,
    ]);

    // 4 kg in a day is more than water explains: a warning, saving is still possible.
    await fireEvent.changeText(screen.getByTestId('weigh-in-weight'), '75.4');
    expect(screen.getByText(/big change since last time/)).toBeOnTheScreen();
    expect(screen.getByText('Save weight')).toBeEnabled();
    // Out of range: not saved.
    await fireEvent.changeText(screen.getByTestId('weigh-in-weight'), '500');
    expect(screen.getByText(/outside the usual range/)).toBeOnTheScreen();
  });

  it('the trend uses the day value: the last weigh-in of a day', () => {
    const days = historyDays(
      [
        weighIn('a', '2026-10-25', 80),
        weighIn('b', TODAY, 79.8, `${TODAY}T07:00:00Z`),
        weighIn('c', TODAY, 80.6, `${TODAY}T21:00:00Z`),
      ],
      [],
    );
    expect(days[0]?.values.weightKg).toBe(80.6);
    expect(days[0]?.changes.weightKg).toBe(0.6);
    expect(days[0]?.weighIns).toHaveLength(2);
  });
});

describe('daily kcal quick entry', () => {
  it('saves intake and active kcal while no food is logged, hidden once the diary is used', async () => {
    await openCheckInSection();
    await fireEvent.changeText(screen.getByTestId('quick-intake'), '2150');
    await fireEvent.changeText(screen.getByTestId('quick-active'), '420');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(body.store.dayKcal).toEqual([{ day: TODAY, intakeKcal: 2150, activeKcal: 420 }]),
    );
    expect(await screen.findByText('Saved for today.')).toBeOnTheScreen();
  });

  it('is not offered on a day with diary entries', async () => {
    body.store.food = [
      {
        id: 'f',
        day: TODAY,
        meal: 'lunch',
        name: 'Rice',
        kcal: 600,
        proteinG: null,
        carbsG: null,
        fatG: null,
        foodId: null,
        amount: null,
        unit: null,
        portionLabel: null,
        createdAt: '',
      },
    ];
    await openCheckInSection();
    expect(screen.queryByTestId('body-quick-kcal')).toBeNull();
  });
});

describe('check-in form', () => {
  it('core fields with instructions, extra fields collapsible, Navy estimate labelled', async () => {
    await renderWithQuery(<CheckInFormScreen />);
    expect(await screen.findByText('Neck')).toBeOnTheScreen();
    expect(screen.getByText(/Just below the larynx/)).toBeOnTheScreen();
    expect(screen.getByText('Hip (widest)')).toBeOnTheScreen();
    expect(screen.queryByText('Calf left')).toBeNull();
    await fireEvent.press(screen.getByTestId('toggle-extra'));
    expect(screen.getByText('Calf left')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId('check-in-weight'), '80.2');
    await fireEvent.changeText(screen.getByTestId('measure-neck'), '38');
    await fireEvent.changeText(screen.getByTestId('measure-belly'), '86');
    await fireEvent.press(screen.getByText('Navy estimate'));
    // Men: height 180, neck 38, belly 86 → about 17 %.
    expect(screen.getByTestId('navy-result')).toHaveTextContent(/Estimated body fat: 1[67]\.\d %/);
    expect(screen.getByText(/It is an estimate/)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('check-in-note'), 'Morning, before breakfast');
    await fireEvent.press(screen.getByTestId('check-in-save'));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(body.store.checkIns.map((c) => [c.day, c.weightKg])).toEqual([[TODAY, 80.2]]);
    const saved = body.store.measurements[0];
    expect(saved?.values).toEqual({ neck: 38, belly: 86 });
    expect(saved?.bodyFatSource).toBe('navy');
    expect(saved?.bodyFatPct).toBeGreaterThan(15);
    expect(saved?.note).toBe('Morning, before breakfast');
  });

  it('warns about an implausible jump and blocks values out of range', async () => {
    body.store.measurements = [checkIn('m1', '2026-10-19', { waist: 80 })];
    await renderWithQuery(<CheckInFormScreen />);
    await fireEvent.changeText(await screen.findByTestId('measure-waist'), '86');
    expect(screen.getByText(/big change since last time/)).toBeOnTheScreen();
    expect(screen.getByTestId('check-in-save')).toBeEnabled();
    await fireEvent.changeText(screen.getByTestId('measure-waist'), '400');
    expect(screen.getByText(/outside the usual range/)).toBeOnTheScreen();
    expect(screen.getByTestId('check-in-save')).toBeDisabled();
  });

  it('adds a progress photo per slot from the camera or the library', async () => {
    jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file://cam/front.jpg', width: 1, height: 1 }],
    } as ImagePicker.ImagePickerResult);
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file://lib/side.png', width: 1, height: 1 }],
    } as ImagePicker.ImagePickerResult);
    await renderWithQuery(<CheckInFormScreen />);
    await fireEvent.press(await screen.findByTestId('take-front'));
    await fireEvent.press(screen.getByTestId('pick-side'));
    await waitFor(() => expect(screen.getAllByText('Remove')).toHaveLength(2));
    await fireEvent.press(screen.getByTestId('check-in-save'));
    await waitFor(() => expect(body.store.measurements).toHaveLength(1));
    expect(body.store.measurements[0]?.photos).toEqual({
      front: { localUri: 'file://cam/front.jpg', remotePath: null },
      side: { localUri: 'file://lib/side.png', remotePath: null },
    });
  });

  it('explains when the photo permission is missing', async () => {
    jest
      .mocked(ImagePicker.requestCameraPermissionsAsync)
      .mockResolvedValueOnce({ granted: false } as ImagePicker.CameraPermissionResponse);
    await renderWithQuery(<CheckInFormScreen />);
    await fireEvent.press(await screen.findByTestId('take-back'));
    expect(await screen.findByText(/needs access to the camera/)).toBeOnTheScreen();
  });

  it('edits a day: corrects its weigh-in and replaces the check-in', async () => {
    body.store.checkIns = [weighIn('w1', '2026-10-19', 81)];
    body.store.measurements = [
      checkIn('m1', '2026-10-19', { waist: 82 }, { bodyFatPct: 20, bodyFatSource: 'manual' }),
    ];
    jest.mocked(useLocalSearchParams).mockReturnValue({ day: '2026-10-19' });
    await renderWithQuery(<CheckInFormScreen />);
    expect(await screen.findByDisplayValue('82')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('20')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('check-in-weight'), '80.8');
    await fireEvent.changeText(screen.getByTestId('measure-waist'), '81.5');
    await fireEvent.press(screen.getByTestId('check-in-save'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(body.store.checkIns).toEqual([expect.objectContaining({ id: 'w1', weightKg: 80.8 })]);
    expect(body.store.measurements).toEqual([
      expect.objectContaining({ id: 'm1', values: { waist: 81.5 }, bodyFatPct: 20 }),
    ]);
  });

  it('takes the body fat value of a scale from Health data', async () => {
    body.store.device = [
      {
        metric: 'body_fat',
        day: TODAY,
        source: 'healthConnect',
        value: 18.4,
        recordedAt: `${TODAY}T06:30:00Z`,
      },
    ];
    await renderWithQuery(<CheckInFormScreen />);
    await fireEvent.press(await screen.findByText('From scale'));
    expect(await screen.findByText('From your scale (Health Connect): 18.4 %')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('check-in-save'));
    await waitFor(() => expect(body.store.measurements).toHaveLength(1));
    expect(body.store.measurements[0]).toEqual(
      expect.objectContaining({ bodyFatPct: 18.4, bodyFatSource: 'scale' }),
    );
  });

  it('refuses an empty check-in and a date in the future', async () => {
    await renderWithQuery(<CheckInFormScreen />);
    await fireEvent.press(await screen.findByTestId('check-in-save'));
    expect(screen.getByText('Enter at least one value.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('check-in-date'), '2026-11-02');
    await fireEvent.changeText(screen.getByTestId('check-in-weight'), '80');
    await fireEvent.press(screen.getByTestId('check-in-save'));
    expect(screen.getByText(/today or earlier/)).toBeOnTheScreen();
    expect(body.store.checkIns).toHaveLength(0);
  });
});

describe('history', () => {
  it('shows weight with change, body fat, measurement changes, thumbnail and note', async () => {
    body.store.checkIns = [weighIn('w1', '2026-10-19', 81), weighIn('w2', TODAY, 80.2)];
    body.store.measurements = [
      checkIn('m1', '2026-10-19', { waist: 84, hip: 100 }),
      checkIn(
        'm2',
        TODAY,
        { waist: 82.5, hip: 100 },
        {
          bodyFatPct: 18.2,
          bodyFatSource: 'navy',
          note: 'Felt good',
          photos: { front: { localUri: 'file://front.jpg', remotePath: null } },
        },
      ),
    ];
    await openCheckInSection();
    const card = screen.getByTestId(`history-${TODAY}`);
    expect(card).toHaveTextContent(/80\.2 kg \(-0\.8 kg\)/);
    expect(card).toHaveTextContent(/Body fat 18\.2 % \(estimate\)/);
    expect(card).toHaveTextContent(/Waist \(narrowest\) -1\.5 cm/);
    expect(card).not.toHaveTextContent(/Hip/);
    expect(card).toHaveTextContent(/Felt good/);
    expect(await screen.findByTestId(`thumb-${TODAY}`)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId(`edit-${TODAY}`));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/body/check-in/new',
      params: { day: TODAY },
    });
  });

  it('deletes a day only after confirming', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    body.store.checkIns = [weighIn('w1', TODAY, 80)];
    body.store.measurements = [checkIn('m1', TODAY, { waist: 82 })];
    await openCheckInSection();
    await fireEvent.press(screen.getByTestId(`delete-${TODAY}`));
    expect(alert).toHaveBeenCalledWith(
      'Delete this check-in?',
      expect.stringContaining('cannot be undone'),
      expect.any(Array),
    );
    expect(body.store.measurements).toHaveLength(1);
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    buttons.find((b) => b.style === 'destructive')?.onPress?.();
    await waitFor(() => expect(body.store.measurements).toHaveLength(0));
    await waitFor(() => expect(body.store.checkIns).toHaveLength(0));
  });

  it('stays readable but cannot change after the add-on ended', async () => {
    billing('expired');
    body.store.checkIns = [weighIn('w1', TODAY, 80)];
    await openCheckInSection();
    expect(screen.getByTestId(`history-${TODAY}`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`delete-${TODAY}`)).toBeNull();
    expect(screen.queryByTestId('body-new-check-in')).toBeNull();
    expect(screen.queryByTestId('body-quick-kcal')).toBeNull();
  });
});

describe('photo comparison', () => {
  it('puts two dates side by side for one view', async () => {
    const photo = (n: string) => ({ front: { localUri: `file://${n}.jpg`, remotePath: null } });
    body.store.measurements = [
      checkIn('m1', '2026-09-28', {}, { photos: photo('a') }),
      checkIn('m2', '2026-10-12', {}, { photos: photo('b') }),
      checkIn('m3', TODAY, {}, { photos: photo('c') }),
    ];
    await renderWithQuery(<PhotoCompareScreen />);
    const pair = await screen.findByTestId('compare-pair');
    expect(pair).toHaveTextContent(/Sep 28.*Oct 26/);
    await fireEvent.press(screen.getAllByText('Oct 12')[0] as never);
    expect(screen.getByTestId('compare-pair')).toHaveTextContent(/Oct 12.*Oct 26/);
    await fireEvent.press(screen.getByText('Side'));
    expect(screen.getByTestId('compare-empty')).toBeOnTheScreen();
  });
});

describe('rhythm', () => {
  it('stores weighing rhythm, measuring day and reminder', async () => {
    await renderWithQuery(<CheckInRhythmScreen />);
    await fireEvent.press(await screen.findByText('Thursday'));
    await waitFor(() => expect(body.store.checkInSettings.measureWeekday).toBe(4));
    await fireEvent.press(screen.getByText('On the measuring day'));
    await waitFor(() => expect(body.store.checkInSettings.weighDaily).toBe(false));
    await fireEvent.press(screen.getByText('Off'));
    await waitFor(() => expect(body.store.checkInSettings.reminder).toBe(false));
  });
});

describe('measuring-day reminder', () => {
  const input: StoredPlanInput = {
    profile: {
      age: 35,
      experience: 'intermediate',
      sports: ['run'],
      terrain: 'flat',
      strength: { mode: 'none' },
    },
    goal: { kind: 'half' },
    availability: { minutesPerDay: [60, 0, 45, 0, 0, 120, 0], doublesAllowed: false },
    targetDate: '2027-02-14',
    hrZones: { age: 35, restingHr: 55 },
  };
  const state = () => {
    const r = generatePlan(input.profile, input.goal, input.availability, TODAY, '2027-02-14');
    if (!r.ok) throw new Error('plan');
    return { plan: r.value, status: {}, pauses: [], revision: 0 };
  };

  it('merges into the workout reminder on training days, else one local notification', () => {
    // Mondays have a workout (availability 60 min), Tuesdays none.
    expect(
      checkInReminderPlan({ today: TODAY, measureWeekday: 1, dailyReminder: true, plan: state() }),
    ).toEqual({ merged: ['2026-10-26', '2026-11-02'], local: [] });
    expect(
      checkInReminderPlan({ today: TODAY, measureWeekday: 2, dailyReminder: true, plan: state() }),
    ).toEqual({ merged: [], local: ['2026-10-27', '2026-11-03'] });
    // Without the daily reminder there is no push to merge into.
    expect(
      checkInReminderPlan({ today: TODAY, measureWeekday: 1, dailyReminder: false, plan: state() }),
    ).toEqual({ merged: [], local: ['2026-10-26', '2026-11-02'] });
  });

  it('schedules local reminders and tags merged days for the daily reminder', async () => {
    body.store.checkInSettings = { weighDaily: true, measureWeekday: 2, reminder: true };
    await renderWithQuery(<BodyCheckInReminder />);
    await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2));
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: 'Measuring day',
          data: { type: 'body-checkin' },
        }),
      }),
    );
  });

  it('adds the check-in line to a workout reminder instead of a second push', async () => {
    plan.store.plan = { id: 'p', input, state: state() };
    body.store.checkInSettings = { weighDaily: true, measureWeekday: 1, reminder: true };
    useSessionStore.setState({
      session: { user: { id: 'user-1', is_anonymous: false } } as never,
      isAnonymous: false,
      ready: true,
    });
    await renderWithQuery(<BodyCheckInReminder />);
    await waitFor(() =>
      expect(useReminderExtras.getState().lines).toEqual({
        '2026-10-26': 'Measuring day: take a minute for your check-in.',
        '2026-11-02': 'Measuring day: take a minute for your check-in.',
      }),
    );
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    useSessionStore.setState({ session: null, isAnonymous: false, ready: true });
  });

  it('is off when the user turned it off or the add-on ended', async () => {
    body.store.checkInSettings = { weighDaily: true, measureWeekday: 2, reminder: false };
    await renderWithQuery(<BodyCheckInReminder />);
    await waitFor(() => expect(Notifications.getAllScheduledNotificationsAsync).toHaveBeenCalled());
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(useReminderExtras.getState().lines).toEqual({});
  });
});

describe('import and export', () => {
  const backup = {
    settings: { height: 178, sex: 'm', cadence: 'weekly', weekday: 0 },
    entries: [
      {
        date: '2026-09-07',
        weight: 84.2,
        bodyfat: 21,
        m: { waist: 90, neck: 39 },
        note: 'Start',
        photos: { front: 'asset-1', side: 'asset-2' },
        days: { '2026-09-06': { in: 2300, rest: 1800, active: 400 } },
      },
      { date: '2026-09-14', weight: 83.5, m: { waist: 89 } },
      { weight: 80 },
    ],
  };

  function pickFile(json: unknown) {
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file://backup.json', name: 'backup.json', lastModified: 0 }],
    } as DocumentPicker.DocumentPickerResult);
    jest
      .mocked(File)
      .mockImplementationOnce(
        () => ({ text: jest.fn(async () => JSON.stringify(json)) }) as unknown as File,
      );
  }

  it('imports a Körper-Tracker backup and reports what could not come along', async () => {
    body.store.profile = { sex: 'male', birthDate: '1990-05-01', weightKg: 80 };
    pickFile(backup);
    await openCheckInSection();
    await fireEvent.press(screen.getByTestId('body-import'));
    const message = await screen.findByTestId('body-check-in-message');
    expect(message).toHaveTextContent(/Imported 3 entries, skipped 1/);
    expect(message).toHaveTextContent(/2 photos could not come along/);
    expect(body.store.checkIns.map((c) => [c.day, c.weightKg, c.source])).toEqual([
      ['2026-09-07', 84.2, 'import'],
      ['2026-09-14', 83.5, 'import'],
    ]);
    expect(body.store.measurements.map((m) => [m.day, m.values, m.bodyFatPct])).toEqual([
      ['2026-09-07', { waist: 90, neck: 39 }, 21],
      ['2026-09-14', { waist: 89 }, null],
    ]);
    expect(body.store.dayKcal).toEqual([{ day: '2026-09-06', intakeKcal: 2300, activeKcal: 400 }]);
    expect(body.store.profile.heightCm).toBe(178);
    expect(body.store.checkInSettings).toEqual(
      expect.objectContaining({ measureWeekday: 0, weighDaily: false }),
    );

    // The same file again adds nothing twice.
    pickFile(backup);
    await fireEvent.press(screen.getByTestId('body-import'));
    await waitFor(() =>
      expect(screen.getByTestId('body-check-in-message')).toHaveTextContent(/Imported 0 entries/),
    );
    expect(body.store.checkIns).toHaveLength(2);
  });

  it('says so when the file is not a backup', async () => {
    pickFile({ hello: 'world' });
    await openCheckInSection();
    await fireEvent.press(screen.getByTestId('body-import'));
    expect(await screen.findByText('This file is not a Körper-Tracker backup.')).toBeOnTheScreen();
  });

  it('exports the complete data as Peakr JSON without photo links', async () => {
    body.store.checkIns = [weighIn('w1', TODAY, 80)];
    body.store.measurements = [
      checkIn(
        'm1',
        TODAY,
        { waist: 82 },
        {
          photos: { front: { localUri: 'file://f.jpg', remotePath: 'u/m1/front.jpg' } },
        },
      ),
    ];
    body.store.dayKcal = [{ day: TODAY, intakeKcal: 2000, activeKcal: null }];
    await exportBodyData(TODAY, 'json');
    const file = jest.mocked(shareFile).mock.calls[0]?.[0];
    expect(file?.name).toBe(`peakr-body-${TODAY}.json`);
    const json = JSON.parse(new TextDecoder().decode(file?.bytes)) as Record<string, unknown>;
    expect(json).toEqual(
      expect.objectContaining({
        format: 'peakr-body',
        weighIns: [{ date: TODAY, weightKg: 80, bodyFatPct: null, note: null }],
        checkIns: [expect.objectContaining({ measurementsCm: { waist: 82 }, photos: ['front'] })],
        days: [{ date: TODAY, intakeKcal: 2000, activeKcal: null }],
      }),
    );
    expect(JSON.stringify(json)).not.toContain('file://');
    expect(JSON.stringify(json)).not.toContain('u/m1');
  });
});

describe('energy model', () => {
  function Probe() {
    const m = useBodyModel();
    return m ? (
      <Text testID="probe">
        {JSON.stringify({
          intake: m.today.intakeKcal,
          source: m.today.intakeSource,
          active: m.today.activeKcal,
          fat: m.composition,
        })}
      </Text>
    ) : null;
  }

  it('counts the quick kcal entry on days without diary entries', async () => {
    body.store.checkIns = [weighIn('w1', TODAY, 80)];
    body.store.dayKcal = [{ day: TODAY, intakeKcal: 2150, activeKcal: 500 }];
    await renderWithQuery(<Probe />);
    const probe = JSON.parse(String((await screen.findByTestId('probe')).props.children)) as {
      intake: number;
      source: string;
      active: number;
    };
    expect(probe.intake).toBe(2150);
    expect(probe.source).toBe('manual');
    // The watch value counts with the correction factor (0.8): 400 of the 500.
    expect(probe.active).toBe(400);
  });

  it('uses the diary instead when there are entries that day', async () => {
    body.store.checkIns = [weighIn('w1', TODAY, 80)];
    body.store.dayKcal = [{ day: TODAY, intakeKcal: 2150, activeKcal: null }];
    body.store.food = [
      {
        id: 'f',
        day: TODAY,
        meal: 'lunch',
        name: 'Rice',
        kcal: 700,
        proteinG: null,
        carbsG: null,
        fatG: null,
        foodId: null,
        amount: null,
        unit: null,
        portionLabel: null,
        createdAt: '',
      },
    ];
    await renderWithQuery(<Probe />);
    const probe = JSON.parse(String((await screen.findByTestId('probe')).props.children)) as {
      intake: number;
    };
    expect(probe.intake).toBe(700);
  });
});
