import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { stackScreenOptions } from '@/features/profile/stack-options';

export default function WatchLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: t('watch.title') }} />
      <Stack.Screen name="send/[id]" options={{ title: t('watch.send.title') }} />
    </Stack>
  );
}
