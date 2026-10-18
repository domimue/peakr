import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function ToolsLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ headerShown: false, title: t('tools.title') }} />
      <Stack.Screen name="heart-rate-zones" options={{ title: t('tools.hrZones.title') }} />
      <Stack.Screen name="zone-2" options={{ title: t('tools.zone2.title') }} />
      <Stack.Screen name="pace" options={{ title: t('tools.pace.title') }} />
      <Stack.Screen name="swim-css" options={{ title: t('tools.swim.title') }} />
    </Stack>
  );
}
