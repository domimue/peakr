import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform } from 'react-native';

import { requestSync, useSyncStore, type SyncStatus } from '@/data/sync/use-background-sync';
import { useQuizStore } from '@/features/onboarding/quiz-store';
import { Button, Card, Screen, Text, TextField } from '@/ui';

import { deleteAccount, signOut, type DeleteAccountResult } from '../auth';
import { useSessionStore } from '../session-store';

/** The word the user types to confirm the deletion (not translated, like the website says). */
export const DELETE_CONFIRMATION = 'DELETE';

/** Where an app subscription is cancelled – deleting the account does not cancel it. */
const SUBSCRIPTIONS_URL =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';

/** Profile → Account: who is signed in, sync state, sign out, delete account. */
export function AccountScreen() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const { status, lastSyncedAt } = useSyncStore();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<Exclude<DeleteAccountResult, 'deleted'> | null>(
    null,
  );
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

  async function doDelete() {
    setBusy(true);
    setDeleteError(null);
    try {
      const result = await deleteAccount();
      if (result !== 'deleted') {
        setDeleteError(result);
        return;
      }
      await useQuizStore.getState().reset();
      queryClient.clear();
      router.replace('/onboarding');
    } catch (e) {
      console.warn('Account deletion failed', e);
      setDeleteError('failed');
    } finally {
      setBusy(false);
    }
  }

  function cancelDelete() {
    setConfirming(false);
    setConfirmText('');
    setDeleteError(null);
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
      {confirming ? (
        <Card>
          <Text variant="heading">{t('auth.account.delete.title')}</Text>
          <Text>{t('auth.account.delete.data')}</Text>
          <Text>{t('auth.account.delete.subscription')}</Text>
          <Button
            variant="secondary"
            label={t(
              Platform.OS === 'ios'
                ? 'auth.account.delete.manageAppStore'
                : 'auth.account.delete.manageGooglePlay',
            )}
            onPress={() => void Linking.openURL(SUBSCRIPTIONS_URL)}
          />
          <TextField
            label={t('auth.account.delete.confirmLabel', { word: DELETE_CONFIRMATION })}
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
          />
          {deleteError ? (
            <Text tone="danger" accessibilityLiveRegion="polite">
              {t(`auth.account.delete.${deleteError}`)}
            </Text>
          ) : null}
          <Button
            variant="danger"
            label={busy ? t('auth.account.delete.deleting') : t('auth.account.delete.confirm')}
            disabled={busy || confirmText.trim() !== DELETE_CONFIRMATION}
            onPress={() => void doDelete()}
          />
          <Button
            variant="secondary"
            label={t('common.cancel')}
            disabled={busy}
            onPress={cancelDelete}
          />
        </Card>
      ) : (
        <Button
          variant="danger"
          label={t('auth.account.delete.button')}
          disabled={busy}
          onPress={() => setConfirming(true)}
        />
      )}
    </Screen>
  );
}
