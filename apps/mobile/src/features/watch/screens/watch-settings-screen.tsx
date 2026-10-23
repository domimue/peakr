import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { selectAccountUserId, useSessionStore } from '@/features/auth/session-store';
import { connect } from '@/features/integrations/api';
import { integrationKeys, useIntegrations } from '@/features/integrations/queries';
import { usePlan } from '@/features/plan/queries';
import { Button, Card, Screen, Text } from '@/ui';

import { syncPlanToWatch } from '../auto-sync';
import { directEnabled, isDirect } from '../options';
import { useSaveWatchChoice, useWatchChoice } from '../queries';
import { createRemoteWatchProvider } from '../remote-provider';
import { WatchPicker } from '../watch-picker';

/**
 * Profile → Watch: pick the brand, connect the account where direct sync is switched on, send the
 * next days now. Everything else (file export) works from each workout's "Watch" action.
 */
export function WatchSettingsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = useSessionStore(selectAccountUserId);
  const { data: choice } = useWatchChoice();
  const save = useSaveWatchChoice();
  const { data: stored } = usePlan();
  const { data: integrations } = useIntegrations(userId);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const direct = choice && isDirect(choice) && directEnabled(choice) ? choice : null;
  const name = direct ? t(`watch.options.${direct}`) : '';
  const connected =
    direct !== null &&
    (integrations?.some((i) => i.provider === direct && i.status === 'active') ?? false);

  const run = async (work: () => Promise<string | null>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await work());
    } finally {
      setBusy(false);
    }
  };

  const onConnect = () =>
    run(async () => {
      if (!direct) return null;
      const result = await connect(direct);
      await queryClient.invalidateQueries({ queryKey: integrationKeys.all });
      return result === 'connected' ? t('watch.settings.connected') : t('connections.result.error');
    });

  const onSyncNow = () =>
    run(async () => {
      if (!direct || !stored) return null;
      const result = await syncPlanToWatch(direct, stored);
      return result.ok
        ? t('watch.send.done', { watch: name })
        : t('watch.send.failed', {
            reason: t(`watch.send.reasons.${result.failure}`, { watch: name }),
          });
    });

  const onDisconnect = () =>
    run(async () => {
      if (!direct) return null;
      await createRemoteWatchProvider(direct).disconnect();
      await queryClient.invalidateQueries({ queryKey: integrationKeys.all });
      return null;
    });

  return (
    <Screen>
      <Text tone="secondary">{t('watch.intro')}</Text>
      <WatchPicker value={choice} onChange={(c) => save.mutate(c)} />
      {direct ? (
        <Card>
          <Text variant="label">{name}</Text>
          {connected ? (
            <>
              <Text tone="secondary">{t('watch.settings.autoSync', { watch: name })}</Text>
              <Button
                variant="secondary"
                label={t('watch.settings.syncNow')}
                disabled={busy}
                onPress={() => void onSyncNow()}
              />
              <Button
                variant="danger"
                label={t('watch.settings.disconnect')}
                disabled={busy}
                onPress={() => void onDisconnect()}
              />
            </>
          ) : (
            <Button
              label={t('watch.settings.connect', { watch: name })}
              disabled={busy || !userId}
              onPress={() => void onConnect()}
            />
          )}
        </Card>
      ) : null}
      {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
    </Screen>
  );
}
