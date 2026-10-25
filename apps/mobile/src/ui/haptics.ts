import * as Haptics from 'expo-haptics';

import { useSettingsStore } from '@/features/settings/settings-store';

/**
 * Haptic "success" when a session is marked done; silently ignored where unsupported or when the
 * user turned haptics off (Profile → Haptics).
 */
export function sessionDoneHaptic(): void {
  if (!useSettingsStore.getState().haptics) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

/** Light tick for a key press or a picked value (keypad). */
export function selectionHaptic(): void {
  if (!useSettingsStore.getState().haptics) return;
  Haptics.selectionAsync().catch(() => undefined);
}
