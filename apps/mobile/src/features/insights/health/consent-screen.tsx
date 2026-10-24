import { HEALTH_GROUPS, type HealthGroup } from '@peakr/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { isEnabled } from '@/config/feature-flags';
import type { ConnectKeyError } from '@/features/health-data/api';
import {
  useConnectPersonalKey,
  useDeleteHealthData,
  useDisconnectPersonalKey,
  useHealthStatus,
  useSaveConsents,
} from '@/features/health-data/queries';
import { connect } from '@/features/integrations/api';
import { Button, Card, CheckList, ListState, Screen, spacing, Text, TextField } from '@/ui';

import { DeviceHealthCard } from './device-health-card';

const MAIN_GROUPS = HEALTH_GROUPS.filter((g) => g !== 'womens_health');

/**
 * Health data settings: the Garmin connection, one switch per data group with exactly what Peakr
 * reads, women's health separately (off unless switched on), and deleting all health data without
 * touching the account (CLAUDE.md "Health → Consent and privacy").
 */
export function HealthConsentScreen() {
  const { t } = useTranslation();
  const { data: status, isPending, isError, refetch } = useHealthStatus();
  const save = useSaveConsents();
  const [selected, setSelected] = useState<HealthGroup[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (isPending) {
    return (
      <Screen>
        <ListState kind="loading" label={t('common.loading')} />
      </Screen>
    );
  }
  if (isError || !status) {
    return (
      <Screen>
        <ListState
          kind="error"
          title={t('common.loadError')}
          retryLabel={t('common.retry')}
          onRetry={() => void refetch()}
        />
      </Screen>
    );
  }

  const chosen = selected ?? status.groups;
  const toggle = (g: HealthGroup) =>
    setSelected(chosen.includes(g) ? chosen.filter((x) => x !== g) : [...chosen, g]);
  const choices = (groups: readonly HealthGroup[]) =>
    groups.map((g) => ({
      value: g,
      label: t(`health.groups.${g}.title`),
      description: t(`health.groups.${g}.reads`),
    }));
  const onSave = () => {
    setMessage(null);
    const groups = Object.fromEntries(HEALTH_GROUPS.map((g) => [g, chosen.includes(g)]));
    save.mutate(groups, {
      onSuccess: (enabled) => {
        setSelected(enabled);
        setMessage(t('health.consent.saved'));
      },
      onError: () => setMessage(t('health.consent.saveError')),
    });
  };

  return (
    <Screen>
      <Text>{t('health.consent.intro')}</Text>
      <GarminCard />
      <DeviceHealthCard groups={status.groups} />

      <CheckList
        label={t('health.consent.title')}
        choices={choices(MAIN_GROUPS)}
        selected={chosen}
        onToggle={toggle}
      />
      <CheckList
        label={t('health.groups.womens_health.title')}
        choices={choices(['womens_health'])}
        selected={chosen}
        onToggle={toggle}
      />
      <Button
        label={t('health.consent.save')}
        onPress={onSave}
        disabled={save.isPending}
        testID="health-consent-save"
      />
      {message ? (
        <Text variant="caption" tone="secondary" accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}
      <Text variant="caption" tone="secondary">
        {t('health.consent.privacy')}
      </Text>
      <DeleteCard />
    </Screen>
  );
}

function GarminCard() {
  const { t } = useTranslation();
  const { data: status, refetch } = useHealthStatus();
  const connection = status?.connection ?? null;
  const oauth = isEnabled('garminHealth') && (status?.offers.oauth ?? false);
  const developer = isEnabled('garminPersonalKey') && (status?.offers.personalKey ?? false);
  return (
    <Card testID="garmin-health-card">
      <Text variant="label">{t('health.consent.connectionTitle')}</Text>
      {connection ? (
        <Text tone={connection.status === 'active' ? 'default' : 'danger'}>
          {connection.status === 'active'
            ? connection.developerKey
              ? t('health.developer.connectedKey')
              : t('health.consent.connected')
            : t('health.consent.connectedExpired')}
        </Text>
      ) : oauth ? (
        <Button
          label={t('health.consent.connectGarmin')}
          icon="watch"
          onPress={() => void connect('garmin').then(() => refetch())}
        />
      ) : (
        <Text tone="secondary">{t('health.consent.garminComing')}</Text>
      )}
      {developer ? <DeveloperKey connected={connection?.developerKey ?? false} /> : null}
    </Card>
  );
}

function DeveloperKey({ connected }: { connected: boolean }) {
  const { t } = useTranslation();
  const connectKey = useConnectPersonalKey();
  const disconnect = useDisconnectPersonalKey();
  const [key, setKey] = useState('');
  const [error, setError] = useState<ConnectKeyError | null>(null);
  return (
    <View style={styles.gap} testID="garmin-developer-key">
      <Text variant="label">{t('health.developer.title')}</Text>
      <Text variant="caption" tone="secondary">
        {t('health.developer.body')}
      </Text>
      {connected ? (
        <Button
          variant="secondary"
          label={t('health.developer.disconnect')}
          disabled={disconnect.isPending}
          onPress={() => disconnect.mutate()}
        />
      ) : (
        <>
          <TextField
            label={t('health.developer.field')}
            value={key}
            onChangeText={setKey}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            error={error ? t(`health.developer.errors.${error}`) : undefined}
          />
          <Button
            variant="secondary"
            label={t('health.developer.connect')}
            disabled={connectKey.isPending || key.trim().length === 0}
            onPress={() =>
              connectKey.mutate(key, {
                onSuccess: (result) => {
                  setError(result);
                  // The key goes to the server once and is not kept on the phone.
                  if (result === null) setKey('');
                },
                onError: () => setError('unavailable'),
              })
            }
          />
        </>
      )}
    </View>
  );
}

function DeleteCard() {
  const { t } = useTranslation();
  const remove = useDeleteHealthData();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <Card testID="health-delete">
      <Text variant="label">{t('health.consent.deleteTitle')}</Text>
      <Text variant="caption" tone="secondary">
        {t('health.consent.deleteBody')}
      </Text>
      {confirming ? (
        <View style={styles.row}>
          <Button
            variant="danger"
            label={t('health.consent.deleteConfirm')}
            disabled={remove.isPending}
            onPress={() =>
              remove.mutate(undefined, {
                onSuccess: () => setMessage(t('health.consent.deleted')),
                onError: () => setMessage(t('health.consent.deleteError')),
                onSettled: () => setConfirming(false),
              })
            }
          />
          <Button
            variant="secondary"
            label={t('health.consent.deleteCancel')}
            onPress={() => setConfirming(false)}
          />
        </View>
      ) : (
        <Button
          variant="secondary"
          icon="trash"
          label={t('health.consent.deleteTitle')}
          onPress={() => setConfirming(true)}
        />
      )}
      {message ? (
        <Text variant="caption" tone="secondary" accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm, marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
});
