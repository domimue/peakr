import type { HealthGroup } from '@peakr/engine';
import { useTranslation } from 'react-i18next';

import { useAllowDeviceHealth, useDeviceHealth } from '@/features/health-data/read-device';
import { Button, Card, Text } from '@/ui';

/**
 * Health Connect on this phone as the second source of the same groups. Only shown where the store
 * exists; asks for exactly the record types of the groups that are switched on.
 */
export function DeviceHealthCard({ groups }: { groups: readonly HealthGroup[] }) {
  const { t } = useTranslation();
  const device = useDeviceHealth();
  const allow = useAllowDeviceHealth();
  if (!device.supported) return null;
  return (
    <Card testID="device-health-card">
      <Text variant="label">{t(`health.sources.${device.store}`)}</Text>
      <Text variant="caption" tone="secondary">
        {t('health.consent.deviceBody')}
      </Text>
      {device.provides.length > 0 ? <Text>{t('health.consent.deviceConnected')}</Text> : null}
      <Button
        variant="secondary"
        label={t('health.consent.deviceConnect')}
        disabled={allow.isPending || groups.length === 0}
        onPress={() => allow.mutate(groups)}
      />
    </Card>
  );
}
