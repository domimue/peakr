import * as Haptics from 'expo-haptics';

/** Haptic "success" when a session is marked done; silently ignored where unsupported. */
export function sessionDoneHaptic(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
