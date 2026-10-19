import {
  formatDuration,
  historyByMonth,
  performance,
  SPORTS,
  type HistoryEntry,
  type Totals,
} from '@peakr/engine';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { todayIso } from '@/data/ids';
import { Card, ListState, radius, SegmentedControl, spacing, StatTile, Text, useTheme } from '@/ui';

import { formatDate } from '../plan/calendar';
import { calendarTitle, typeColor, typeName } from '../plan/kind';
import { usePlan } from '../plan/queries';
import { WeeklyChart } from './weekly-chart';

type Section = 'history' | 'performance';
type Period = 4 | 12 | 52;

const PERIODS: readonly Period[] = [4, 12, 52];

/** "3 h 20 min" / "45 min". */
function hoursText(t: TFunction, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? t('progress.hoursMinutes', { h, m }) : t('workoutText.minutes', { count: m });
}

/**
 * Progress: History (completed sessions by month with month totals) and Performance (period
 * picker, totals, minutes per week with the average, personal bests, lifetime totals). Activities
 * imported from Strava / watches join here in a later phase.
 */
export function ProgressScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: stored, isPending, isError, refetch } = usePlan();
  const [section, setSection] = useState<Section>('history');
  const [period, setPeriod] = useState<Period>(12);

  let content: React.ReactNode;
  if (isPending) content = <ListState kind="loading" label={t('common.loading')} />;
  else if (isError) {
    content = (
      <ListState
        kind="error"
        title={t('common.loadError')}
        retryLabel={t('common.retry')}
        onRetry={() => void refetch()}
      />
    );
  } else if (!stored) {
    content = (
      <ListState
        kind="empty"
        icon="progress"
        title={t('progress.noPlan')}
        actionLabel={t('plan.startQuiz')}
        onAction={() => router.push('/onboarding')}
      />
    );
  } else if (section === 'history') {
    content = <History />;
  } else {
    content = <Performance period={period} onPeriod={setPeriod} />;
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} testID="progress-scroll">
        <Text variant="title" accessibilityRole="header">
          {t('progress.title')}
        </Text>
        <SegmentedControl
          options={[
            { value: 'history', label: t('progress.history') },
            { value: 'performance', label: t('progress.performance') },
          ]}
          value={section}
          onChange={setSection}
        />
        {content}
      </ScrollView>
    </SafeAreaView>
  );
}

function History() {
  const { t, i18n } = useTranslation();
  const { data: stored } = usePlan();
  if (!stored) return null;
  const months = historyByMonth(stored.state, stored.input.profile);
  if (months.length === 0) {
    return (
      <ListState
        kind="empty"
        icon="progress"
        title={t('progress.emptyHistory')}
        message={t('progress.emptyHistoryHint')}
      />
    );
  }
  return (
    <View style={styles.gap} testID="history">
      {months.map((m) => {
        const totals = [
          t('progress.sessions', { count: m.sessions }),
          hoursText(t, m.minutes),
          m.km > 0 ? t('plan.km', { value: Math.round(m.km) }) : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <View key={m.month} style={styles.gapSm} testID={`month-${m.month}`}>
            <View style={styles.monthHead}>
              <Text variant="label" accessibilityRole="header">
                {formatDate(`${m.month}-01`, i18n.language, { month: 'long', year: 'numeric' })}
              </Text>
              <Text variant="caption" tone="secondary">
                {totals}
              </Text>
            </View>
            {m.entries.map((e) => (
              <HistoryCard key={e.workout.id} entry={e} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

function HistoryCard({ entry }: { entry: HistoryEntry }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const w = entry.workout;
  const figures = [
    entry.km > 0 ? t('plan.km', { value: entry.km }) : null,
    hoursText(t, entry.minutes),
    entry.paceSecPerKm !== null
      ? t('progress.pace', { pace: formatDuration(entry.paceSecPerKm) })
      : null,
  ].filter(Boolean) as string[];
  const title = calendarTitle(t, w);
  const day = formatDate(w.date, i18n.language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, typeName(t, w.type), day, ...figures].join(', ')}
      onPress={() => router.push(`/training/workout/${encodeURIComponent(w.id)}`)}
      style={({ pressed }) => [
        styles.history,
        { backgroundColor: pressed ? colors.surface2 : colors.surface },
      ]}
      testID={`history-${w.id}`}
    >
      <View style={[styles.bar, { backgroundColor: typeColor(colors, w) }]} />
      <View style={styles.flex}>
        <Text style={styles.strong}>{title}</Text>
        <Text variant="caption" tone="secondary">
          {`${day} · ${typeName(t, w.type)}`}
        </Text>
      </View>
      <View style={styles.figures}>
        {figures.map((f) => (
          <Text key={f} variant="caption">
            {f}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}

function TotalsTiles({ totals, prefix }: { totals: Totals; prefix: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.tiles}>
      <StatTile
        testID={`${prefix}-sessions`}
        value={String(totals.sessions)}
        label={t('progress.tiles.sessions')}
      />
      <StatTile value={hoursText(t, totals.minutes)} label={t('progress.tiles.time')} />
      <StatTile
        value={t('plan.km', { value: Math.round(totals.km) })}
        label={t('progress.tiles.distance')}
      />
      <StatTile value={String(Math.round(totals.load))} label={t('progress.tiles.load')} />
    </View>
  );
}

function Performance({ period, onPeriod }: { period: Period; onPeriod: (p: Period) => void }) {
  const { t, i18n } = useTranslation();
  const { data: stored } = usePlan();
  if (!stored) return null;
  const perf = performance(stored.state, stored.input.profile, todayIso(), period);
  const label = (iso: string) =>
    formatDate(iso, i18n.language, { day: 'numeric', month: 'numeric' });
  const step = Math.ceil(perf.weeks.length / 8);
  const bars = perf.weeks.map((w, i) => ({
    weekStart: w.weekStart,
    label: i % step === 0 ? label(w.weekStart) : '',
    minutes: w.minutes,
  }));
  const { longestSession, biggestWeek, longestKm } = perf.bests;

  return (
    <View style={styles.gap} testID="performance">
      <SegmentedControl
        options={PERIODS.map((p) => ({ value: String(p), label: t(`progress.periods.${p}`) }))}
        value={String(period)}
        onChange={(v) => onPeriod(Number(v) as Period)}
      />
      <TotalsTiles totals={perf.period} prefix="period" />
      <Card>
        <Text variant="label">{t('progress.chart.title')}</Text>
        {perf.period.sessions === 0 ? (
          <ListState kind="empty" icon="progress" title={t('progress.emptyPeriod')} />
        ) : (
          <WeeklyChart
            bars={bars}
            averageMinutes={perf.averageMinutes}
            accessibilityLabel={t('progress.chart.a11y', {
              weeks: perf.weeks.length,
              average: perf.averageMinutes,
              max: Math.max(...perf.weeks.map((w) => w.minutes)),
            })}
          />
        )}
      </Card>

      <Text variant="heading">{t('progress.bests')}</Text>
      {longestSession === null ? (
        <ListState kind="empty" icon="trophy" title={t('progress.emptyBests')} />
      ) : (
        <Card testID="bests">
          <BestRow
            label={t('progress.best.longestSession')}
            value={`${hoursText(t, longestSession.minutes)} · ${calendarTitle(t, longestSession.workout)}`}
          />
          {biggestWeek ? (
            <BestRow
              label={t('progress.best.biggestWeek')}
              value={`${hoursText(t, biggestWeek.minutes)} · ${label(biggestWeek.weekStart)}`}
            />
          ) : null}
          {SPORTS.filter((s) => (longestKm[s] ?? 0) > 0).map((s) => (
            <BestRow
              key={s}
              label={t(`progress.best.longest.${s}`)}
              value={t('plan.km', { value: longestKm[s] })}
            />
          ))}
          <Text variant="caption" tone="secondary">
            {t('progress.bestsHint')}
          </Text>
        </Card>
      )}

      <Text variant="heading">{t('progress.lifetime')}</Text>
      <TotalsTiles totals={perf.lifetime} prefix="lifetime" />
    </View>
  );
}

function BestRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.best} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text tone="secondary" style={styles.flex}>
        {label}
      </Text>
      <Text style={styles.strong}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  gap: { gap: spacing.md },
  gapSm: { gap: spacing.sm },
  flex: { flex: 1 },
  strong: { fontWeight: '600' },
  monthHead: { gap: 2 },
  history: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.sm + spacing.xs,
    paddingLeft: spacing.md,
    overflow: 'hidden',
  },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  figures: { alignItems: 'flex-end', gap: 2 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  best: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.xs },
});
