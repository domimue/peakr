import '@/i18n';
// Defines the background task for activity pushes; must run at module scope on every start.
import { registerBackgroundSync } from '@/features/notifications/background-task';

import { Archivo_400Regular, Archivo_500Medium } from '@expo-google-fonts/archivo';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useDatabaseMigrations } from '@/data/db/use-database-migrations';
import { queryClient } from '@/data/query-client';
import { useActivityRealtime } from '@/data/sync/use-activity-realtime';
import { useBackgroundSync } from '@/data/sync/use-background-sync';
import { ActivityNoticeHost } from '@/features/activities/activity-notice';
import {
  selectAccountUserId,
  useAuthListener,
  useSessionStore,
} from '@/features/auth/session-store';
import { useBillingStore } from '@/features/billing/billing-store';
import { TrialReminderTap } from '@/features/billing/trial-reminder-tap';
import { LiveSessionRestore } from '@/features/gym/live-session-restore';
import { captureInstallReferrer } from '@/features/deep-links/install-referrer';
import { DailyReminder } from '@/features/notifications/daily-reminder';
import { registerPushToken } from '@/features/notifications/push';
import { useSettingsStore } from '@/features/settings/settings-store';
import { useWatchAutoSync } from '@/features/watch/auto-sync';
import { fontFamilies, toNavigationTheme, useTheme } from '@/ui';

void SplashScreen.preventAutoHideAsync();
registerBackgroundSync();

export default function RootLayout() {
  const theme = useTheme();
  const { success, error } = useDatabaseMigrations();
  useAuthListener();
  // Archivo 400/500 for body and UI, the static Peakr-Display instance (800 / width 112) for headlines.
  const [fontsLoaded, fontError] = useFonts({
    [fontFamilies.display]: require('@peakr/theme/fonts/Peakr-Display.ttf'),
    [fontFamilies.body]: Archivo_400Regular,
    [fontFamilies.bodyMedium]: Archivo_500Medium,
  });
  const ready = (success || error !== undefined) && (fontsLoaded || fontError !== null);

  // Theme, units, haptics and language from SQLite, once the tables exist.
  useEffect(() => {
    if (success) void useSettingsStore.getState().hydrate();
  }, [success]);

  // Android: where this install came from (attribution only, read once).
  useEffect(() => {
    void captureInstallReferrer();
  }, []);

  useEffect(() => {
    if (error) console.error('Database migration failed', error);
    if (fontError) console.error('Font loading failed', fontError);
    if (ready) void SplashScreen.hideAsync();
  }, [ready, error, fontError]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <BackgroundSync />
        <DailyReminder />
        <TrialReminderTap />
        {success ? <LiveSessionRestore /> : null}
        <ThemeProvider value={toNavigationTheme(theme)}>
          <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false }} />
          <ActivityNoticeHost />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Syncs SQLite with Supabase while an account is signed in (inside the query client for refreshes):
 * background sync, Realtime for new activities, and this device's push token (no prompt here).
 * An anonymous user from the quiz gets none of these.
 */
function BackgroundSync() {
  const userId = useSessionStore(selectAccountUserId);
  useBackgroundSync();
  useActivityRealtime();
  // Garmin / COROS / Suunto: the next two weeks follow the plan (off until the platform is approved).
  useWatchAutoSync();
  useEffect(() => {
    if (userId) void registerPushToken(userId);
  }, [userId]);
  // Entitlements follow the Supabase user, the same id the web checkout uses in RevenueCat.
  useEffect(() => {
    void useBillingStore.getState().init(userId);
  }, [userId]);
  return null;
}
