import '@/i18n';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useDatabaseMigrations } from '@/data/db/use-database-migrations';
import { queryClient } from '@/data/query-client';
import { toNavigationTheme, useTheme } from '@/ui';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const theme = useTheme();
  const { success, error } = useDatabaseMigrations();
  const ready = success || error !== undefined;

  useEffect(() => {
    if (error) console.error('Database migration failed', error);
    if (ready) void SplashScreen.hideAsync();
  }, [ready, error]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={toNavigationTheme(theme)}>
          <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false }} />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
