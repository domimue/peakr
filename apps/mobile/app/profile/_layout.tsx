import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function ProfileLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: t('profile.title') }} />
      <Stack.Screen name="personal" options={{ title: t('profile.personal.title') }} />
    </Stack>
  );
}
