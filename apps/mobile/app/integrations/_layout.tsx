import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { stackScreenOptions } from '@/features/profile/stack-options';

export default function IntegrationsLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ ...stackScreenOptions, title: t('connections.title') }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[provider]" />
    </Stack>
  );
}
