import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConnectResult } from '@/features/integrations/api';
import { Button, Screen, Text } from '@/ui';

import { usePendingConnect, type BaselineFlow } from '../pending-connect';
import { importAndOpen } from './baseline-step';

/**
 * The Strava result arrived as a deep link while the baseline flow was waiting for it (Android:
 * the Strava app handled the consent). Goes on with the import and the list, or explains what
 * went wrong with a way back to where the user started.
 */
export function BaselineConnectResult({
  flow,
  result,
}: {
  flow: BaselineFlow;
  result: Exclude<ConnectResult, 'cancelled'>;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(
    result === 'connected' ? null : `baseline.errors.${result}`,
  );
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    usePendingConnect.getState().set(null);
    if (result !== 'connected') return;
    importAndOpen(flow, 'replace')
      .then(setError)
      .catch(() => setError('baseline.errors.error'));
  }, [flow, result]);

  return (
    <Screen title={t('baseline.step.title')}>
      {error ? (
        <>
          <Text tone="danger">{t(error as never)}</Text>
          <Button label={t('baseline.back')} onPress={() => router.back()} />
        </>
      ) : (
        <Text tone="secondary">{t('baseline.step.loading')}</Text>
      )}
    </Screen>
  );
}
