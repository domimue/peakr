import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { clearReconnectHint, hasReconnectHint } from '@/data/repositories/baseline-repository';
import { useSessionStore } from '@/features/auth/session-store';
import { connect } from '@/features/integrations/api';
import { Button, Card, spacing, Text } from '@/ui';

import { useBaselineStore } from '../baseline-store';

export type BaselineFlow = 'onboarding' | 'recalibrate';

const ROUTES = {
  onboarding: { select: '/onboarding/baseline', summary: '/onboarding/baseline-summary' },
  recalibrate: { select: '/training/baseline', summary: '/training/baseline-summary' },
} as const;

export function baselineRoutes(flow: BaselineFlow) {
  return ROUTES[flow];
}

/**
 * Connects Strava if needed and imports the last 60 days. Returns an error message key, or null
 * after a successful import.
 */
export function useBaselineImport(flow: BaselineFlow) {
  const load = useBaselineStore((s) => s.load);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      // The quiz runs before the account exists: Strava needs a (possibly anonymous) user.
      await useSessionStore.getState().ensureSession();
      let result = await load();
      if (!result.ok && (result.reason === 'not_connected' || result.reason === 'reconnect')) {
        const connected = await connect('strava', flow === 'onboarding' ? 'baseline' : undefined);
        if (connected !== 'connected') {
          if (connected !== 'cancelled') setError(`baseline.errors.${connected}`);
          return;
        }
        result = await load();
      }
      if (!result.ok) {
        setError(`baseline.errors.${result.reason}`);
        return;
      }
      await clearReconnectHint();
      router.push(ROUTES[flow].select);
    } catch {
      setError('baseline.errors.error');
    } finally {
      setBusy(false);
    }
  };

  return { start, busy, error };
}

/**
 * Quiz step "Make my plan more accurate": an optional Strava connection whose last 60 days
 * calibrate the plan. Skipping costs nothing; the plan then starts from the quiz answers.
 */
export function BaselineStep() {
  const { t } = useTranslation();
  const { activities, meta, hydrate } = useBaselineStore();
  const { start, busy, error } = useBaselineImport('onboarding');
  const [reconnect, setReconnect] = useState(false);

  useEffect(() => {
    void hydrate();
    void hasReconnectHint().then(setReconnect);
  }, [hydrate]);

  const selected = activities.filter((a) => a.selected).length;
  const used = meta !== null && activities.length > 0;

  return (
    <View style={styles.root}>
      <Text variant="heading" accessibilityRole="header">
        {t('baseline.step.title')}
      </Text>
      <Text tone="secondary">{t('baseline.step.body')}</Text>
      <Text variant="caption" tone="secondary">
        {t('baseline.step.privacy')}
      </Text>
      {reconnect && !used ? (
        <Card>
          <Text>{t('baseline.step.reconnect')}</Text>
        </Card>
      ) : null}
      {used ? (
        <Card>
          <Text>{t('baseline.step.used', { count: selected })}</Text>
          <View style={styles.actions}>
            <Button
              label={t('baseline.step.review')}
              variant="secondary"
              onPress={() => router.push(ROUTES.onboarding.summary)}
            />
            <Button
              label={t('baseline.step.importAgain')}
              variant="secondary"
              small
              disabled={busy}
              onPress={() => void start()}
            />
          </View>
        </Card>
      ) : (
        <Button
          label={busy ? t('baseline.step.loading') : t('baseline.step.connect')}
          disabled={busy}
          onPress={() => void start()}
        />
      )}
      {error ? <Text tone="danger">{t(error as never)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
