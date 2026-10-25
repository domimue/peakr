import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { authAvailable, selectAccountUserId, useSessionStore } from '@/features/auth/session-store';
import { ListState, Screen } from '@/ui';

import { savePendingLink } from './pending-link';
import { FALLBACK_TARGET, openTarget } from './targets';

/**
 * Where every link into the app lands (`/open/...`, cold and warm start alike): waits until the
 * stored session is read, then opens the target. Without an account the target is remembered and
 * the sign-in opens first – logging in with the checkout account is what restores the plan.
 */
export function OpenLinkScreen() {
  const { t } = useTranslation();
  const { path } = useLocalSearchParams<{ path?: string | string[] }>();
  const ready = useSessionStore((s) => s.ready);
  const accountUserId = useSessionStore(selectAccountUserId);
  const segments = path === undefined ? [] : Array.isArray(path) ? path : [path];
  const target = openTarget(segments) ?? FALLBACK_TARGET;

  useEffect(() => {
    if (!ready) return;
    if (!authAvailable || accountUserId) {
      router.replace(target);
      return;
    }
    savePendingLink(target);
    router.replace('/auth/sign-in');
  }, [ready, accountUserId, target]);

  return (
    <Screen>
      <ListState kind="loading" label={t('common.loading')} />
    </Screen>
  );
}
