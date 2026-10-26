import { Redirect, Stack, useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useEntitlement } from '@/features/billing/billing-store';

/** Without the add-on only the paywall opens; every other Body route leads there. */
const FREE_ROUTES = ['addon'];

/**
 * Body screens reached by deep links, notifications and the Today card. The guard decides:
 * switched off → Today; locked → the add-on paywall; expired → the screens open read-only.
 */
export default function BodyLayout() {
  const { t } = useTranslation();
  const guard = useEntitlement('body_nutrition');
  const segments = useSegments() as string[];
  const route = segments[segments.indexOf('body') + 1];
  if (!guard.visible) return <Redirect href="/today" />;
  if (
    guard.state !== 'pending' &&
    !guard.canRead &&
    route !== undefined &&
    !FREE_ROUTES.includes(route)
  ) {
    return <Redirect href="/body/addon" />;
  }
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="addon" options={{ title: t('bodyAddon.paywall.title') }} />
      <Stack.Screen name="today" options={{ title: t('bodyAddon.sections.today') }} />
      <Stack.Screen name="check-in" options={{ title: t('bodyAddon.sections.checkIn') }} />
      <Stack.Screen name="progress" options={{ title: t('bodyAddon.sections.progress') }} />
      <Stack.Screen name="goal" options={{ title: t('bodyAddon.goal.title') }} />
    </Stack>
  );
}
