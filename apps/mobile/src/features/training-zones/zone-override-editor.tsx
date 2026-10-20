import { formatDuration, type ZoneNumber } from '@peakr/engine';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Card, DurationField, spacing, Text, TextField } from '@/ui';

import { useDurationField, useIntegerField } from './form';
import { overrideLimits, validateOverride, type OverrideIssue } from './resolve';
import type { HrZoneOverride, PaceZoneOverride, ZoneKind } from './settings';

type Override = HrZoneOverride | PaceZoneOverride;

export interface ZoneOverrideEditorProps {
  kind: ZoneKind;
  zone: ZoneNumber;
  /** Current range of the zone (calculated or custom); open ends are null. */
  current: { lower: number | null; upper: number | null };
  isCustom: boolean;
  onApply: (override: Override) => void;
  onReset: () => void;
  onCancel: () => void;
}

/** Inline form to replace one calculated zone with a manual range. */
export function ZoneOverrideEditor(props: ZoneOverrideEditorProps) {
  return props.kind === 'hr' ? <HrEditor {...props} /> : <PaceEditor {...props} />;
}

function HrEditor({
  zone,
  current,
  isCustom,
  onApply,
  onReset,
  onCancel,
}: ZoneOverrideEditorProps) {
  const { t } = useTranslation();
  const lower = useIntegerField(current.lower);
  const upper = useIntegerField(current.upper);
  const [issue, setIssue] = useState<OverrideIssue | 'incomplete'>();

  const apply = () => {
    if (lower.value === undefined || upper.value === undefined) return setIssue('incomplete');
    const override = { minBpm: lower.value, maxBpm: upper.value };
    const problem = validateOverride('hr', override);
    if (problem) return setIssue(problem);
    onApply(override);
  };

  return (
    <EditorShell
      zone={zone}
      kind="hr"
      issue={issue}
      isCustom={isCustom}
      onApply={apply}
      onReset={onReset}
      onCancel={onCancel}
    >
      <View style={styles.row}>
        {(
          [
            ['lower', lower],
            ['upper', upper],
          ] as const
        ).map(([key, field]) => (
          <View key={key} style={styles.flex}>
            <TextField
              label={t(`trainingZones.override.${key}`)}
              value={field.text}
              onChangeText={field.setText}
              keyboardType="number-pad"
              maxLength={3}
              suffix={t('units.bpm')}
            />
          </View>
        ))}
      </View>
    </EditorShell>
  );
}

function PaceEditor({
  kind,
  zone,
  current,
  isCustom,
  onApply,
  onReset,
  onCancel,
}: ZoneOverrideEditorProps) {
  const { t } = useTranslation();
  // Pace zones store slowest (larger seconds) as lower and fastest as upper bound.
  const slowest = useDurationField({ showHours: false, initialSec: current.lower });
  const fastest = useDurationField({ showHours: false, initialSec: current.upper });
  const [issue, setIssue] = useState<OverrideIssue | 'incomplete'>();
  const unitLabels = { h: t('units.h'), m: t('units.min'), s: t('units.s') };
  const accessibilityLabels = { h: t('units.hours'), m: t('units.minutes'), s: t('units.seconds') };
  const unit = kind === 'swimPace' ? t('units.per100m') : t('units.perKm');

  const apply = () => {
    if (slowest.value === undefined || fastest.value === undefined) return setIssue('incomplete');
    const override = { slowestSec: slowest.value, fastestSec: fastest.value };
    const problem = validateOverride(kind, override);
    if (problem) return setIssue(problem);
    onApply(override);
  };

  return (
    <EditorShell
      zone={zone}
      kind={kind}
      issue={issue}
      isCustom={isCustom}
      onApply={apply}
      onReset={onReset}
      onCancel={onCancel}
    >
      {(
        [
          ['slowest', slowest],
          ['fastest', fastest],
        ] as const
      ).map(([key, field]) => (
        <DurationField
          key={key}
          label={t(`trainingZones.override.${key}`, { unit })}
          value={field.parts}
          onChange={field.setParts}
          unitLabels={unitLabels}
          accessibilityLabels={accessibilityLabels}
          error={field.parseError ? t(`validation.${field.parseError}`) : undefined}
        />
      ))}
    </EditorShell>
  );
}

interface EditorShellProps {
  zone: ZoneNumber;
  kind: ZoneKind;
  issue: OverrideIssue | 'incomplete' | undefined;
  isCustom: boolean;
  onApply: () => void;
  onReset: () => void;
  onCancel: () => void;
  children: ReactNode;
}

function EditorShell({
  zone,
  kind,
  issue,
  isCustom,
  onApply,
  onReset,
  onCancel,
  children,
}: EditorShellProps) {
  const { t } = useTranslation();
  const { min, max } = overrideLimits[kind];
  const limit = (value: number) => (kind === 'hr' ? String(value) : formatDuration(value));

  return (
    <Card>
      <Text variant="heading">
        {t('trainingZones.override.title', {
          zone: t('zones.label', { zone }),
          name: t(`zones.names.${zone}`),
        })}
      </Text>
      {children}
      {issue ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {t(`trainingZones.override.errors.${issue}`, { min: limit(min), max: limit(max) })}
        </Text>
      ) : null}
      <Button label={t('trainingZones.override.apply')} onPress={onApply} />
      {isCustom ? (
        <Button variant="secondary" label={t('trainingZones.override.reset')} onPress={onReset} />
      ) : null}
      <Button variant="secondary" label={t('common.cancel')} onPress={onCancel} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
