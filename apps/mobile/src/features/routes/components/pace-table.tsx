import { formatDuration, type KmEvaluation, type PaceSegment } from '@peakr/engine';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, Text, useTheme } from '@/ui';

const pct = (gradient: number) => `${gradient > 0 ? '+' : ''}${(gradient * 100).toFixed(1)} %`;

const kmLabel = (startM: number, endM: number) =>
  endM - startM >= 999 ? String(Math.round(endM / 1000)) : (endM / 1000).toFixed(2);

function Row({ cells, header }: { cells: string[]; header?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.row, { borderBottomColor: colors.border }]}
      accessible
      accessibilityRole={header ? 'header' : undefined}
      accessibilityLabel={cells.join(', ')}
    >
      {cells.map((c, i) => (
        <Text
          key={i}
          variant="caption"
          tone={header ? 'secondary' : 'default'}
          style={[styles.cell, i === 0 && styles.first]}
        >
          {c}
        </Text>
      ))}
    </View>
  );
}

export interface PaceTableProps {
  segments: readonly PaceSegment[];
  /** HR target of the session (e.g. "Zone 2 · 129–147 bpm"); primary when pace is a limit. */
  hrTarget?: string | null;
}

/**
 * Per-km pace plan on the route (CLAUDE.md "Grade-adjusted pace"): gradient and target per km
 * (shorter rows on steep sections). Easy sessions phrase the pace as a limit, HR leads.
 */
export function PaceTable({ segments, hrTarget }: PaceTableProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const primary = segments[0]?.pacePrimary ?? false;
  return (
    <View style={[styles.table, { backgroundColor: colors.surface }]} testID="pace-table">
      <Text variant="caption" tone="secondary">
        {primary
          ? t('routes.pace.primaryHint')
          : t('routes.pace.limitHint', { hr: hrTarget ?? '' })}
      </Text>
      <Row
        header
        cells={[t('routes.pace.km'), t('routes.pace.gradient'), t('routes.pace.target')]}
      />
      {segments.map((s) => (
        <Row
          key={s.startM}
          cells={[
            kmLabel(s.startM, s.endM),
            pct(s.gradient),
            primary
              ? t('routes.pace.range', {
                  fast: formatDuration(s.fastestSecPerKm),
                  slow: formatDuration(s.slowestSecPerKm),
                })
              : t('routes.pace.noFasterThan', { pace: formatDuration(s.fastestSecPerKm) }),
          ]}
        />
      ))}
    </View>
  );
}

export interface EvaluationTableProps {
  km: readonly KmEvaluation[];
  sport: 'run' | 'bike';
}

/** Grade-adjusted evaluation per km after the activity synced: actual, GAP and plan. */
export function EvaluationTable({ km, sport }: EvaluationTableProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const run = sport === 'run';
  const head = run
    ? [
        t('routes.pace.km'),
        t('routes.pace.gradient'),
        t('routes.eval.pace'),
        t('routes.eval.gap'),
        t('routes.eval.plan'),
      ]
    : [t('routes.pace.km'), t('routes.pace.gradient'), t('routes.eval.speed'), t('routes.eval.hr')];
  return (
    <View style={[styles.table, { backgroundColor: colors.surface }]} testID="evaluation-table">
      <Row header cells={head} />
      {km.map((k) => {
        const verdict = k.verdict ? t(`routes.eval.verdict.${k.verdict}`) : '';
        const cells = run
          ? [
              String(k.km),
              pct(k.gradient),
              formatDuration(k.paceSecPerKm),
              k.gapSecPerKm !== null ? formatDuration(k.gapSecPerKm) : '–',
              k.plannedSecPerKm !== null
                ? `${formatDuration(k.plannedSecPerKm)} ${verdict}`.trim()
                : '–',
            ]
          : [
              String(k.km),
              pct(k.gradient),
              t('routes.eval.kmh', { value: k.speedKmh }),
              k.avgHr !== null ? String(k.avgHr) : '–',
            ];
        return <Row key={k.km} cells={cells} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { borderRadius: radius.md, padding: spacing.sm, gap: spacing.xs },
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cell: { flex: 2 },
  first: { flex: 1 },
});
