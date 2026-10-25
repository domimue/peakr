import { findWorkout, generatePlan, newPlanState, type Plan } from '@peakr/engine';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import i18n from '@/i18n';

import * as settingsRepo from '@/data/repositories/settings-repository';
import { useSessionStore } from '@/features/auth/session-store';
import { reminderDays, reminderWorkout } from '@/features/notifications/reminder-days';
import {
  DEFAULT_REMINDER_SETTINGS,
  parseReminderSettings,
} from '@/features/notifications/reminder-settings';
import { DEFAULT_WEATHER_SETTINGS } from '@/features/weather/settings';
import { renderWithQuery } from '@/test-utils/render-with-query';
import { sessionDoneHaptic } from '@/ui/haptics';

import { DEFAULT_APP_SETTINGS, parseAppSettings } from '../app-settings';
import { NotificationsScreen } from '../screens/notifications-screen';
import { HapticsScreen, UnitsScreen } from '../screens/preference-screens';
import { useSettingsStore } from '../settings-store';
import { distanceText, paceText } from '../units';

jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/route-repository');
jest.mock('@/data/repositories/activity-repository');

const repo =
  settingsRepo as unknown as typeof import('@/data/repositories/__mocks__/settings-repository');
const t = i18n.t.bind(i18n);

beforeEach(() => {
  repo.resetStore();
  useSettingsStore.setState({ ...DEFAULT_APP_SETTINGS });
});

describe('stored settings', () => {
  it('fall back to the defaults for unknown or broken values', () => {
    expect(parseAppSettings(null)).toEqual(DEFAULT_APP_SETTINGS);
    expect(
      parseAppSettings({ units: 'furlongs', haptics: 'yes', themePreference: 'light' }),
    ).toEqual({ ...DEFAULT_APP_SETTINGS, themePreference: 'light' });
    expect(parseReminderSettings({ minute: 2000, enabled: false })).toEqual({
      ...DEFAULT_REMINDER_SETTINGS,
      enabled: false,
    });
    // On by default at 07:00 with the weather line.
    expect(DEFAULT_REMINDER_SETTINGS).toEqual({ enabled: true, minute: 420, weather: true });
  });

  it('are read on start and saved on change', async () => {
    repo.store.app = { ...DEFAULT_APP_SETTINGS, units: 'imperial' };
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState()).toMatchObject({ units: 'imperial', hydrated: true });
    useSettingsStore.getState().setHaptics(false);
    await waitFor(() => expect(repo.store.app.haptics).toBe(false));
  });
});

describe('units', () => {
  it('converts distances and paces for imperial, keeps metric as is', () => {
    expect(distanceText(t, 'metric', 12.34)).toBe('12.3 km');
    expect(distanceText(t, 'imperial', 16.09344, 0)).toBe('10 mi');
    expect(paceText('metric', 300)).toBe('5:00 /km');
    expect(paceText('imperial', 300)).toBe('8:03 /mi');
  });

  it('switches on the units screen', async () => {
    await renderWithQuery(<UnitsScreen />);
    await fireEvent.press(screen.getByText('Imperial'));
    expect(useSettingsStore.getState().units).toBe('imperial');
  });
});

describe('haptics', () => {
  it('can be turned off', async () => {
    const haptic = Haptics.notificationAsync as jest.Mock;
    haptic.mockClear();
    sessionDoneHaptic();
    expect(haptic).toHaveBeenCalledTimes(1);
    await renderWithQuery(<HapticsScreen />);
    await fireEvent.press(screen.getByText('Off'));
    sessionDoneHaptic();
    expect(haptic).toHaveBeenCalledTimes(1);
  });
});

describe('daily reminder', () => {
  const plan: Plan = (() => {
    const r = generatePlan(
      {
        age: 35,
        experience: 'intermediate',
        sports: ['run'],
        terrain: 'flat',
        strength: { mode: 'none', equipment: 'home' },
      },
      { kind: 'half' },
      { minutesPerDay: [60, 0, 45, 0, 60, 120, 0], doublesAllowed: false },
      '2026-10-19',
      '2027-02-14',
    );
    if (!r.ok) throw new Error('plan');
    return r.value;
  })();
  const profile = {
    age: 35,
    experience: 'intermediate' as const,
    sports: ['run' as const],
    terrain: 'flat' as const,
    strength: { mode: 'none' as const, equipment: 'home' as const },
  };

  it('one text per workout day, none on rest days, done/skipped days or in a pause', () => {
    const state = newPlanState(plan);
    const days = reminderDays(
      t,
      'en',
      state,
      profile,
      null,
      DEFAULT_WEATHER_SETTINGS,
      '2026-10-26',
    );
    const dates = days.map((d) => d.date);
    // Tuesday 27 and Thursday 29 have no availability: rest days.
    expect(dates).not.toContain('2026-10-27');
    expect(dates).not.toContain('2026-10-29');
    expect(dates).toContain('2026-10-26');
    expect(days[0]?.title).toMatch(/^Today: /);

    const monday = reminderWorkout(state, '2026-10-26');
    expect(monday && findWorkout(plan, monday.id)).toBeTruthy();
    const done = { ...state, status: { [monday?.id ?? '']: 'done' as const } };
    expect(reminderWorkout(done, '2026-10-26')).toBeNull();
    const paused = {
      ...state,
      pauses: [{ startDate: '2026-10-26', endDate: null, reason: 'illness' as const }],
    };
    expect(
      reminderDays(t, 'en', paused, profile, null, DEFAULT_WEATHER_SETTINGS, '2026-10-26'),
    ).toEqual([]);
  });

  it('settings screen: off, time in 15-minute steps, weather line', async () => {
    useSessionStore.setState({ isAnonymous: false });
    await renderWithQuery(<NotificationsScreen />);
    expect(await screen.findByText('Daily workout reminder')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Reminder time: 0?7:00/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Reminder time, Later'));
    await waitFor(() => expect(repo.store.reminder.minute).toBe(435));
    await fireEvent.press(screen.getAllByText('Off')[0] as never);
    await waitFor(() => expect(repo.store.reminder.enabled).toBe(false));
    await waitFor(() => expect(screen.queryByText('Reminder time')).not.toBeOnTheScreen());
    await fireEvent.press(screen.getAllByText('On')[0] as never);
    await waitFor(() => expect(repo.store.reminder.enabled).toBe(true));
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
  });
});
