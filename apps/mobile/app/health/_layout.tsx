import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function HealthLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="consent" options={{ title: t('health.consent.title') }} />
      <Stack.Screen name="[metric]" options={{ title: '' }} />
    </Stack>
  );
}
