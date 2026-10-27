import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { stackScreenOptions } from '@/features/profile/stack-options';

export default function StrengthLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="setup" options={{ title: t('strength.setup.title') }} />
      <Stack.Screen name="routines/index" options={{ title: t('strength.routines.title') }} />
      <Stack.Screen name="routines/[id]" options={{ title: t('strength.builder.title') }} />
      <Stack.Screen name="workout" options={{ title: t('strength.workout.title') }} />
      <Stack.Screen name="quick-log" options={{ title: t('strength.quickLog.title') }} />
    </Stack>
  );
}
