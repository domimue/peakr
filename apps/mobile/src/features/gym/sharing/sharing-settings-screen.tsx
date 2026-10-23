import { DEFAULT_SHARE_SETTINGS } from '@peakr/engine';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { health } from '@/features/health/health';
import { Card, Screen, SegmentedControl, spacing, Text } from '@/ui';

import { useSaveShareSettings, useShareSettings } from './queries';
import { useHealthSupported } from './share-panels';

/**
 * Gym → Sharing: the defaults for new sessions. Both are off until switched on here; each session
 * can still be changed when it is saved. Nothing is posted without one of these being on.
 */
export function SharingSettingsScreen() {
  const { t } = useTranslation();
  const settings = useShareSettings().data ?? DEFAULT_SHARE_SETTINGS;
  const save = useSaveShareSettings();
  const healthSupported = useHealthSupported();
  const store = t(`healthWrite.stores.${health.store}`);
  const onOff = (value: boolean) => (value ? 'on' : 'off');
  return (
    <Screen>
      <Card style={styles.card}>
        <Text variant="heading">{t('stravaPost.settingTitle')}</Text>
        <Text variant="caption" tone="secondary">
          {t('stravaPost.settingHint')}
        </Text>
        <SegmentedControl
          options={[
            { value: 'off', label: t('stravaPost.settingOff') },
            { value: 'on', label: t('stravaPost.settingOn') },
          ]}
          value={onOff(settings.strava)}
          onChange={(v) => save.mutate({ ...settings, strava: v === 'on' })}
        />
      </Card>
      {healthSupported ? (
        <Card style={styles.card}>
          <Text variant="heading">{t('healthWrite.settingTitle', { store })}</Text>
          <Text variant="caption" tone="secondary">
            {t('healthWrite.settingHint')}
          </Text>
          <SegmentedControl
            options={[
              { value: 'off', label: t('stravaPost.settingOff') },
              { value: 'on', label: t('stravaPost.settingOn') },
            ]}
            value={onOff(settings.health)}
            onChange={(v) => save.mutate({ ...settings, health: v === 'on' })}
          />
        </Card>
      ) : (
        <View />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
});
