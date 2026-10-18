import { Redirect, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

/** Developer tools – only reachable in development builds (`__DEV__`). */
export default function DevLayout() {
  const { t } = useTranslation();
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="plan" options={{ title: t('dev.planPreview.title') }} />
    </Stack>
  );
}
