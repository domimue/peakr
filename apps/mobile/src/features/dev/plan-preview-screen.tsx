import { generatePlan, type PlanNote, type PlanWeek, type Workout } from '@peakr/engine';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, Screen, SegmentedControl, spacing, Text, useTheme } from '@/ui';

import { PLAN_PRESETS, PREVIEW_START, type PresetId } from './plan-presets';

const PRESET_IDS: PresetId[] = ['half', 'tri', 'weightloss', 'granfondo'];

/**
 * Development-only screen: renders a generated 12-week plan so the engine output can be
 * sanity-checked on a device. Not reachable in production builds.
 */
export function PlanPreviewScreen() {
  const { t } = useTranslation();
  const [presetId, setPresetId] = useState<PresetId>('half');

  const result = useMemo(() => {
    const p = PLAN_PRESETS[presetId];
    return generatePlan(p.profile, p.goal, p.availability, PREVIEW_START, p.targetDate);
  }, [presetId]);

  return (
    <Screen>
      <SegmentedControl
        options={PRESET_IDS.map((id) => ({ value: id, label: t(`dev.planPreview.presets.${id}`) }))}
        value={presetId}
        onChange={setPresetId}
      />
      {result.ok ? (
        <>
          {result.value.notes.map((note) => (
            <NoteText key={note.key} note={note} />
          ))}
          {result.value.weeks.map((week) => (
            <WeekCard key={week.index} week={week} />
          ))}
        </>
      ) : (
        <Text>
          {t('dev.planPreview.error', {
            issues: result.issues.map((i) => `${i.field}: ${i.code}`).join(', '),
          })}
        </Text>
      )}
    </Screen>
  );
}

function WeekCard({ week }: { week: PlanWeek }) {
  const { t } = useTranslation();
  return (
    <Card accessibilityLabel={`week-${week.index + 1}`}>
      <Text variant="heading">
        {t('dev.planPreview.week', { week: week.index + 1, date: week.startDate })}
      </Text>
      <View style={styles.badges}>
        <Badge label={t(`dev.planPreview.phases.${week.phase}`)} />
        {week.isRecovery ? <Badge label={t('dev.planPreview.recovery')} /> : null}
        {week.isPartial ? <Badge label={t('dev.planPreview.partial')} /> : null}
      </View>
      <Text variant="caption" tone="secondary">
        {t('dev.planPreview.summary', {
          load: Math.round(week.load),
          target: week.targetLoad,
          minutes: week.minutes,
          share: Math.round(week.hardShare * 100),
        })}
      </Text>
      {week.notes.map((note, i) => (
        <NoteText key={`${note.key}-${i}`} note={note} />
      ))}
      {week.workouts.length === 0 ? (
        <Text tone="secondary">{t('dev.planPreview.rest')}</Text>
      ) : (
        week.workouts.map((w) => <WorkoutRow key={w.id} workout={w} />)
      )}
    </Card>
  );
}

function WorkoutRow({ workout: w }: { workout: Workout }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const level = w.level === null ? '' : ` · L${w.level}`;
  return (
    <View style={[styles.row, { borderTopColor: colors.border }]}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle}>
          {`${t(`dev.planPreview.weekdays.${w.weekday}`)} · ${w.templateId}${level}`}
        </Text>
        {w.hard ? <Badge label={t('dev.planPreview.hard')} /> : null}
      </View>
      <Text variant="caption" tone="secondary">
        {`${w.durationMin} min · ${w.target.value} · load ${w.load} · ${w.role}`}
        {w.terrain ? ` · +${w.terrain.expectedGainM} m` : ''}
        {w.winterVariant
          ? ` · ❄ ${w.winterVariant.templateId} ${w.winterVariant.durationMin} min`
          : ''}
      </Text>
      <Text variant="caption">{t(w.whyKey as never)}</Text>
      {w.notes.map((note, i) => (
        <NoteText key={`${note.key}-${i}`} note={note} />
      ))}
    </View>
  );
}

function NoteText({ note }: { note: PlanNote }) {
  const { t } = useTranslation();
  const params: Record<string, string | number> = { ...note.params };
  return (
    <Text variant="caption" tone="secondary">
      {`ⓘ ${t(note.key as never, params) as string}`}
    </Text>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  row: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm, gap: 2 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontWeight: '600', flexShrink: 1 },
});
