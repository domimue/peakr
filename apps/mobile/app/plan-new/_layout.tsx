import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function NewPlanLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: t('planNew.title') }} />
      <Stack.Screen name="confirm" options={{ title: t('planNew.confirm.title') }} />
    </Stack>
  );
}
