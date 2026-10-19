import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function IntegrationsLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{ headerBackButtonDisplayMode: 'minimal', title: t('connections.title') }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[provider]" />
    </Stack>
  );
}
