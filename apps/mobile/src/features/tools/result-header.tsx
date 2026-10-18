import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, spacing, Text } from '@/ui';

export interface ResultHeaderProps {
  label: string;
  value: string;
  isEstimate?: boolean;
  note?: string;
}

/** A prominent key result (e.g. "CSS pace 1:45 /100 m"), optionally marked as an estimate. */
export function ResultHeader({ label, value, isEstimate, note }: ResultHeaderProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.root}>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <View style={styles.valueRow}>
        <Text variant="title" style={styles.value}>
          {value}
        </Text>
        {isEstimate ? <Badge label={t('common.estimate')} /> : null}
      </View>
      {note ? (
        <Text variant="caption" tone="secondary">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  value: { fontVariant: ['tabular-nums'] },
});
