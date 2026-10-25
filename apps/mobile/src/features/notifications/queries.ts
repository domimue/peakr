import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as repo from '@/data/repositories/settings-repository';

import type { ReminderSettings } from './reminder-settings';

/** TanStack Query hooks of the daily reminder settings (the server copy follows in the sync). */

export const reminderKeys = { settings: ['notifications', 'reminder'] as const };

export function useReminderSettings() {
  return useQuery({ queryKey: reminderKeys.settings, queryFn: repo.getReminderSettings });
}

export function useSaveReminderSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (settings: ReminderSettings) => repo.saveReminderSettings(settings),
    onSuccess: () => client.invalidateQueries({ queryKey: reminderKeys.settings }),
  });
}
