import {
  analyzeRaceResult,
  formatDuration,
  REFERENCE_RACE_IDS,
  type ReferenceRaceId,
} from '@peakr/engine';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Badge,
  Card,
  DurationField,
  Reveal,
  Screen,
  SegmentedControl,
  spacing,
  Text,
  useTheme,
  ZoneTable,
} from '@/ui';

import { useDurationField, useFieldError } from '../form';
import { useZoneFormat } from '../format';
import { ResultHeader } from '../result-header';

export function PaceScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const fieldError = useFieldError();
  const { paceRows } = useZoneFormat();

  const [distance, setDistance] = useState<ReferenceRaceId>('10k');
  const time = useDurationField({ showHours: true });

  const result = analyzeRaceResult({ distance, timeSec: time.value });
  const issues = result.ok ? [] : result.issues;
  const perKm = t('units.perKm');
  const pace = (sec: number) => t('units.paceValue', { pace: formatDuration(sec), unit: perKm });

  return (
    <Screen>
      <Text tone="secondary">{t('tools.pace.intro')}</Text>
      <SegmentedControl
        options={REFERENCE_RACE_IDS.map((id) => ({ value: id, label: t(`races.${id}`) }))}
        value={distance}
        onChange={setDistance}
      />
      <DurationField
        label={t('tools.pace.timeLabel', { distance: t(`races.${distance}`) })}
        value={time.parts}
        onChange={time.setParts}
        onBlur={time.onBlur}
        showHours
        unitLabels={{ h: t('units.h'), m: t('units.min'), s: t('units.s') }}
        accessibilityLabels={{ h: t('units.hours'), m: t('units.minutes'), s: t('units.seconds') }}
        error={fieldError(time, 'timeSec', issues, formatDuration)}
      />

      {result.ok ? (
        <Reveal>
          <Card>
            <ResultHeader
              label={t('tools.pace.racePace')}
              value={pace(result.value.paceSecPerKm)}
            />
            <ResultHeader
              label={t('tools.pace.thresholdPace')}
              value={pace(result.value.thresholdPaceSecPerKm)}
              isEstimate
              note={t('tools.pace.thresholdNote')}
            />
          </Card>

          <View style={styles.headingRow}>
            <Text variant="heading">{t('tools.pace.predictionsTitle')}</Text>
            <Badge label={t('common.estimate')} />
          </View>
          <View style={[styles.table, { borderColor: colors.border }]}>
            {result.value.predictions.map((p, index) => (
              <View
                key={p.distance}
                accessible
                style={[
                  styles.predictionRow,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.border,
                  },
                  p.isInput && { backgroundColor: colors.surfaceSelected },
                ]}
              >
                <Text style={styles.flex}>{t(`races.${p.distance}`)}</Text>
                <Text style={styles.time}>{formatDuration(p.timeSec)}</Text>
                <Text tone="secondary" style={styles.paceCol}>
                  {pace(p.paceSecPerKm)}
                </Text>
              </View>
            ))}
          </View>
          <Text variant="caption" tone="secondary">
            {t('tools.pace.predictionsNote')}
          </Text>

          <Text variant="heading">{t('tools.pace.zonesTitle')}</Text>
          <ZoneTable rows={paceRows(result.value.paceZones, perKm)} />
        </Reveal>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  predictionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
    minHeight: 48,
  },
  flex: { flex: 1 },
  time: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  paceCol: { minWidth: 84, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
