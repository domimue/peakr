import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

/** Settings – reached from Profile; no profile icon here (it would lead back to where you came from). */
export default function SettingsLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: t('settings.title') }} />
      <Stack.Screen name="notifications" options={{ title: t('profile.notifications') }} />
      <Stack.Screen name="units" options={{ title: t('profile.units') }} />
      <Stack.Screen name="appearance" options={{ title: t('profile.appearance') }} />
      <Stack.Screen name="haptics" options={{ title: t('settings.haptics.title') }} />
      <Stack.Screen name="language" options={{ title: t('profile.language') }} />
      <Stack.Screen name="privacy" options={{ title: t('profile.privacy') }} />
    </Stack>
  );
}
