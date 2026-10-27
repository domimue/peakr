import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { stackScreenOptions } from '@/features/profile/stack-options';

export default function HealthLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="consent" options={{ title: t('health.consent.title') }} />
      <Stack.Screen name="diagnostics" options={{ title: t('health.diagnostics.title') }} />
      <Stack.Screen name="[metric]" options={{ title: '' }} />
    </Stack>
  );
}
