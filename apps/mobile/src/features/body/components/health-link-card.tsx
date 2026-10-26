import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { BODY_HEALTH_METRICS } from '@/features/health/types';
import { Button, Card, spacing, Text } from '@/ui';

import {
  useAllowNutritionWrite,
  useBodyHealth,
  useConnectBodyHealth,
  useRefreshBodyHealth,
} from '../health-link';

/**
 * Connects the phone's health store to Body (only shown while the add-on is active). Lists what
 * is read before the system sheet opens; reads again each time Body opens.
 */
export function HealthLinkCard() {
  const { t } = useTranslation();
  const state = useBodyHealth();
  const connect = useConnectBodyHealth();
  const refresh = useRefreshBodyHealth();
  const write = useAllowNutritionWrite();
  const allowed = state.data?.allowed ?? [];
  const store = t(`bodyAddon.sources.${state.data?.store ?? 'healthConnect'}`);
  const { mutate } = refresh;

  useEffect(() => {
    if (allowed.length > 0) mutate();
  }, [allowed.length, mutate]);

  if (!state.data?.supported) return null;
  const complete = BODY_HEALTH_METRICS.every((m) => allowed.includes(m));

  return (
    <Card style={styles.card} testID="body-health-link">
      <Text variant="heading">{t('bodyAddon.health.title', { store })}</Text>
      {allowed.length > 0 ? (
        <Text tone="secondary">
          {t('bodyAddon.health.connected', {
            store,
            list: allowed.map((m) => t(`bodyAddon.health.metrics.${m}`)).join(', '),
          })}
        </Text>
      ) : (
        <Text tone="secondary">
          {t('bodyAddon.health.intro', {
            list: BODY_HEALTH_METRICS.map((m) => t(`bodyAddon.health.metrics.${m}`)).join(', '),
          })}
        </Text>
      )}
      {complete ? null : (
        <Button
          variant="secondary"
          label={t(allowed.length > 0 ? 'bodyAddon.health.more' : 'bodyAddon.health.connect', {
            store,
          })}
          disabled={connect.isPending}
          onPress={() => connect.mutate()}
        />
      )}
      {state.data.writesNutrition ? (
        <Text variant="caption" tone="secondary">
          {t('bodyAddon.health.writing', { store })}
        </Text>
      ) : (
        <Button
          small
          variant="secondary"
          testID="body-health-write"
          label={t('bodyAddon.health.write', { store })}
          disabled={write.isPending}
          onPress={() => write.mutate()}
        />
      )}
      <Text variant="caption" tone="secondary">
        {t('bodyAddon.health.privacy')}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
});
