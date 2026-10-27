import { Redirect, Stack, useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useHasGym } from '@/features/billing/billing-store';

import { stackScreenOptions } from '@/features/profile/stack-options';

/** Without the add-on only these routes open: the paywall and "mark done with duration and effort". */
const FREE_ROUTES = ['addon', 'quick-log'];

/**
 * Gym workspace screens opened from the Gym tab, the plan and the profile. Logging, history,
 * statistics, routines and the library belong to the add-on; everything else is sent to the paywall.
 */
export default function GymLayout() {
  const { t } = useTranslation();
  const hasGym = useHasGym();
  const segments = useSegments() as string[];
  const route = segments[segments.indexOf('gym') + 1];
  if (!hasGym && route !== undefined && !FREE_ROUTES.includes(route)) {
    return <Redirect href="/gym/addon" />;
  }
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="addon" options={{ title: t('gymAddon.paywall.title') }} />
      <Stack.Screen name="library" options={{ title: t('gym.library.title') }} />
      <Stack.Screen name="exercise/[id]" options={{ title: t('gym.exercise.title') }} />
      <Stack.Screen name="exercise/edit" options={{ title: t('gym.exercise.editTitle') }} />
      <Stack.Screen name="routines/index" options={{ title: t('strength.routines.title') }} />
      <Stack.Screen name="routines/[id]" options={{ title: t('strength.builder.title') }} />
      <Stack.Screen name="session" options={{ title: t('strength.workout.title') }} />
      <Stack.Screen name="live" options={{ title: t('gym.live.title') }} />
      <Stack.Screen name="summary" options={{ title: t('gym.summary.title') }} />
      <Stack.Screen name="history/index" options={{ title: t('gym.history.title') }} />
      <Stack.Screen name="history/[id]" options={{ title: t('gym.history.session') }} />
      <Stack.Screen name="stats" options={{ title: t('gym.stats.title') }} />
      <Stack.Screen name="quick-log" options={{ title: t('strength.quickLog.title') }} />
      <Stack.Screen name="import" options={{ title: t('gym.import.title') }} />
      <Stack.Screen name="sharing" options={{ title: t('gym.sharing.title') }} />
    </Stack>
  );
}
