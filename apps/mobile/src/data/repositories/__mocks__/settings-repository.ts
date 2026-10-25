import {
  DEFAULT_REMINDER_SETTINGS,
  type ReminderSettings,
} from '../../../features/notifications/reminder-settings';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../../../features/settings/app-settings';

/** In-memory settings for Jest (`jest.mock('@/data/repositories/settings-repository')`). */

export const store = {
  app: DEFAULT_APP_SETTINGS as AppSettings,
  reminder: DEFAULT_REMINDER_SETTINGS as ReminderSettings,
};

export function resetStore(): void {
  store.app = DEFAULT_APP_SETTINGS;
  store.reminder = DEFAULT_REMINDER_SETTINGS;
}

export const getAppSettings = jest.fn(async () => store.app);
export const saveAppSettings = jest.fn(async (settings: AppSettings) => {
  store.app = settings;
});
export const getReminderSettings = jest.fn(async () => store.reminder);
export const saveReminderSettings = jest.fn(async (settings: ReminderSettings) => {
  store.reminder = settings;
});
