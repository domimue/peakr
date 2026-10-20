import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { requestSync } from '@/data/sync/use-background-sync';
import { selectAccountUserId, useSessionStore } from '@/features/auth/session-store';
import { usePendingConnect } from '@/features/baseline/pending-connect';
import { registerPushToken, setActivityAlerts, usePushStore } from '@/features/notifications/push';
import { Button, Card, Icon, Screen, SegmentedControl, spacing, Text, useTheme } from '@/ui';

import { connect, disconnect, syncStravaNow, type ConnectResult } from '../api';
import { StravaConnectButton } from '../strava-connect-button';
import { KomootCard } from './komoot-card';
import { useIntegrations } from '../queries';

export interface ConnectionsScreenProps {
  /** Result of a connect flow that came back through the deep link. */
  result?: ConnectResult;
}

/** "5 minutes ago" via i18n – Hermes has no `Intl.RelativeTimeFormat`. */
function relativeTime(t: TFunction, iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return t('connections.ago.now');
  if (minutes < 60) return t('connections.ago.minutes', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('connections.ago.hours', { count: hours });
  return t('connections.ago.days', { count: Math.round(hours / 24) });
}

/**
 * Profile → Connections: connect Strava, see when it last synced, sync now, disconnect. Activities
 * sync automatically once connected (webhook → Realtime / push); "sync now" is the backup.
 */
export function ConnectionsScreen({ result }: ConnectionsScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const userId = useSessionStore(selectAccountUserId);
  const { data: integrations, isPending, refetch } = useIntegrations(userId);
  const activityAlerts = usePushStore((s) => s.activityAlerts);
  const pushReady = usePushStore((s) => s.token !== null);
  const [busy, setBusy] = useState(false);
  const resultText = (r: Exclude<ConnectResult, 'cancelled'>) => t(`connections.result.${r}`);
  const [message, setMessage] = useState<string | null>(
    result && result !== 'cancelled' ? resultText(result) : null,
  );

  if (!userId) {
    return (
      <Screen>
        <Text>{t('connections.signInFirst')}</Text>
        <Button label={t('profile.signIn')} onPress={() => router.push('/auth/sign-in')} />
      </Screen>
    );
  }

  const strava = integrations?.find((i) => i.provider === 'strava') ?? null;
  const connected = strava !== null && strava.status === 'active';

  async function pullIntoApp() {
    if (!userId) return;
    const changed = await requestSync(userId);
    if (changed) await queryClient.invalidateQueries();
    await refetch();
  }

  async function onConnect() {
    if (!userId) return;
    setBusy(true);
    setMessage(null);
    try {
      // A connection from here returns to Connections, not to an abandoned baseline flow.
      usePendingConnect.getState().set(null);
      const outcome = await connect('strava');
      if (outcome !== 'cancelled') setMessage(resultText(outcome));
      if (outcome === 'connected') {
        // Ask for notifications in context: new activities can then wake the app.
        void registerPushToken(userId, true);
        await pullIntoApp();
      } else {
        await refetch();
      }
    } catch (e) {
      console.warn('Connect failed', e);
      setMessage(t('connections.result.error'));
    } finally {
      setBusy(false);
    }
  }

  async function onSyncNow() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await syncStravaNow();
      if (r.ok) {
        setMessage(t('connections.syncDone', { count: r.imported }));
        await pullIntoApp();
      } else {
        setMessage(
          t(r.reason === 'rate_limited' ? 'connections.rateLimited' : 'connections.syncFailed'),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function onDisconnect() {
    Alert.alert(t('connections.disconnectTitle'), t('connections.disconnectMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('connections.disconnect'),
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void disconnect('strava')
            .then(async (ok) => {
              setMessage(t(ok ? 'connections.disconnected' : 'connections.disconnectFailed'));
              await pullIntoApp();
            })
            .finally(() => setBusy(false));
        },
      },
    ]);
  }

  return (
    <Screen>
      <Card testID="strava-card">
        <View style={styles.row}>
          <Icon name="connections" size={22} color={colors.text} />
          <Text variant="subtitle" style={styles.flex}>
            Strava
          </Text>
          <Text variant="caption" tone="secondary">
            {isPending
              ? ''
              : connected
                ? t('connections.connected')
                : strava
                  ? t('connections.needsReconnect')
                  : t('connections.notConnected')}
          </Text>
        </View>
        <Text tone="secondary">{t('connections.stravaHint')}</Text>
        {connected ? (
          <Text variant="caption" tone="secondary" testID="strava-last-synced">
            {strava.lastSyncedAt
              ? t('connections.lastSynced', {
                  time: relativeTime(t, strava.lastSyncedAt),
                })
              : t('connections.neverSynced')}
          </Text>
        ) : null}
      </Card>

      {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}

      {connected ? (
        <>
          <Button
            icon="connections"
            variant="secondary"
            label={t('connections.syncNow')}
            disabled={busy}
            onPress={() => void onSyncNow()}
          />
          {pushReady ? (
            <Card>
              <Text>{t('connections.alerts')}</Text>
              <Text variant="caption" tone="secondary">
                {t('connections.alertsHint')}
              </Text>
              <SegmentedControl
                options={[
                  { value: 'off', label: t('connections.alertsOff') },
                  { value: 'on', label: t('connections.alertsOn') },
                ]}
                value={activityAlerts ? 'on' : 'off'}
                onChange={(v) => void setActivityAlerts(v === 'on')}
              />
            </Card>
          ) : null}
          <Button
            variant="danger"
            label={t('connections.disconnect')}
            disabled={busy}
            onPress={onDisconnect}
          />
        </>
      ) : (
        <StravaConnectButton
          label={t('connections.connectStrava')}
          disabled={busy || isPending}
          onPress={() => void onConnect()}
        />
      )}

      <KomootCard />

      <Text variant="caption" tone="secondary">
        {t('connections.privacy')}
      </Text>
      <Text variant="caption" tone="secondary">
        {t('connections.poweredBy')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
