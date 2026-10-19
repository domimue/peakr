import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { requestSync, useSyncStore, type SyncStatus } from '@/data/sync/use-background-sync';
import { Button, Card, Screen, Text } from '@/ui';

import { signOut } from '../auth';
import { useSessionStore } from '../session-store';

/** Profile → Account: who is signed in, sync state, sign out. Account deletion follows later. */
export function AccountScreen() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const { status, lastSyncedAt } = useSyncStore();
  const [busy, setBusy] = useState(false);
  const userId = session?.user.id ?? null;

  const statusText: Record<SyncStatus, string> = {
    idle: lastSyncedAt
      ? t('auth.account.lastSynced', {
          time: new Date(lastSyncedAt).toLocaleTimeString(i18n.language, {
            hour: '2-digit',
            minute: '2-digit',
          }),
        })
      : t('auth.account.syncNever'),
    syncing: t('auth.account.syncSyncing'),
    offline: t('auth.account.syncOffline'),
    error: t('auth.account.syncError'),
  };

  async function doSignOut(force: boolean) {
    if (!userId) return;
    setBusy(true);
    try {
      const result = await signOut(userId, force);
      if (result === 'unsynced') {
        Alert.alert(t('auth.account.unsyncedTitle'), t('auth.account.unsyncedMessage'), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('auth.account.signOutAnyway'),
            style: 'destructive',
            onPress: () => void doSignOut(true),
          },
        ]);
        return;
      }
      await queryClient.invalidateQueries();
      router.replace('/today');
    } catch (e) {
      console.warn('Sign-out failed', e);
      Alert.alert(t('auth.account.signOutFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <Screen>
        <Button label={t('profile.signIn')} onPress={() => router.replace('/auth/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Text tone="secondary" variant="caption">
          {t('auth.account.signedInAs')}
        </Text>
        <Text>{session.user.email ?? session.user.id}</Text>
      </Card>
      <Card>
        <Text tone="secondary" variant="caption">
          {t('auth.account.sync')}
        </Text>
        <Text accessibilityLiveRegion="polite">{statusText[status]}</Text>
      </Card>
      <Button
        variant="secondary"
        label={t('auth.account.syncNow')}
        disabled={busy || status === 'syncing'}
        onPress={() =>
          void requestSync(session.user.id).then((changed) => {
            if (changed) void queryClient.invalidateQueries();
          })
        }
      />
      <Button
        variant="danger"
        label={t('auth.account.signOut')}
        disabled={busy}
        onPress={() => void doSignOut(false)}
      />
    </Screen>
  );
}
