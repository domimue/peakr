import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function RoutesLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: t('routes.title') }} />
      <Stack.Screen name="[id]" options={{ title: t('routes.detailTitle') }} />
      <Stack.Screen name="import" options={{ title: t('routes.import.title') }} />
      <Stack.Screen name="recognise" options={{ title: t('routes.recognise.title') }} />
    </Stack>
  );
}
