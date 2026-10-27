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
import { Pressable, StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import { useLinkedActivities } from '@/features/activities/queries';
import { RouteShape } from '@/features/routes/components/route-shape';
import {
  Card,
  ListState,
  radius,
  SegmentedControl,
  spacing,
  StatTile,
  TileGrid,
  Text,
  useTheme,
} from '@/ui';
import { useUnits } from '@/features/settings/units';

import { formatDate } from '../plan/calendar';
import { calendarTitle, typeColor, typeName } from '../plan/kind';
import { BadgeShelf, goalName } from '../plan-history/badges';
import { useHistorySources } from '../plan-history/sources';
import { WeeklyChart } from './weekly-chart';

type Period = 4 | 12 | 52;
/** "This plan" or "All time" (every plan ever, archived ones included). */
type Scope = 'plan' | 'all';
type Sources = ReturnType<typeof useHistorySources>;

const PERIODS: readonly Period[] = [4, 12, 52];

/** "3 h 20 min" / "45 min". */
function hoursText(t: TFunction, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? t('progress.hoursMinutes', { h, m }) : t('workoutText.minutes', { count: m });
}

/**
 * Training and Records of Insights (CLAUDE.md "UI patterns"): Training = completed sessions by
 * month with month totals; Records = period picker, totals, minutes per week with the average,
 * badges, personal bests, lifetime totals. With archived plans a labelled switch shows "This plan"
 * or "All time"; personal bests and lifetime totals are always all time (CLAUDE.md "Plan
 * history"). Without any plan they show the way to the quiz.
 */
/** Plan → History: completed sessions and records of this plan or all plans (CLAUDE.md "Plan"). */
export function PlanHistory() {
  const { t } = useTranslation();
  const [section, setSection] = useState<'history' | 'performance'>('history');
  return (
    <View style={styles.gap} testID="plan-history">
      <SegmentedControl
        options={[
          { value: 'history', label: t('progress.sessionsTab') },
          { value: 'performance', label: t('progress.records') },
        ]}
        value={section}
        onChange={setSection}
      />
      <PlanInsights section={section} />
    </View>
  );
}

export function PlanInsights({ section }: { section: 'history' | 'performance' }) {
  const { t } = useTranslation();
  const sources = useHistorySources();
  const [period, setPeriod] = useState<Period>(12);
  const [chosen, setScope] = useState<Scope>('plan');

  if (sources.isPending) return <ListState kind="loading" label={t('common.loading')} />;
  if (sources.isError) {
    return (
      <ListState
        kind="error"
        title={t('common.loadError')}
        retryLabel={t('common.retry')}
        onRetry={sources.refetch}
      />
    );
  }
  if (sources.all.length === 0) {
    return (
      <ListState
        kind="empty"
        icon="progress"
        title={t('progress.noPlan')}
        actionLabel={t('plan.startQuiz')}
        onAction={() => router.push('/onboarding')}
      />
    );
  }
  const hasArchive = sources.archived.length > 0;
  // Without an active plan there is only "All time".
  const scope: Scope = sources.current.length === 0 ? 'all' : chosen;
  return (
    <View style={styles.gap}>
      {hasArchive && sources.current.length > 0 ? (
        <SegmentedControl
          options={[
            { value: 'plan', label: t('progress.scope.plan') },
            { value: 'all', label: t('progress.scope.all') },
          ]}
          value={scope}
          onChange={(v) => setScope(v as Scope)}
        />
      ) : null}
      {section === 'history' ? (
        <History sources={sources} scope={scope} />
      ) : (
        <Performance sources={sources} scope={scope} period={period} onPeriod={setPeriod} />
      )}
    </View>
  );
}

function History({ sources, scope }: { sources: Sources; scope: Scope }) {
  const { t, i18n } = useTranslation();
  const { distance } = useUnits();
  const { data: linked } = useLinkedActivities();
  const months = historyByMonth(scope === 'plan' ? sources.current : sources.all);
  const goals = new Map(sources.archived.map((a) => [a.id, a.goal.kind]));
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
          m.km > 0 ? distance(m.km, 0) : null,
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
            {m.entries.map((e) => {
              const archivedGoal = goals.get(e.planId);
              const activity = archivedGoal ? undefined : linked?.get(e.workout.id)?.activity;
              return (
                <HistoryCard
                  key={`${e.planId}:${e.workout.id}`}
                  entry={e}
                  planLabel={
                    archivedGoal
                      ? t('progress.fromPlan', { goal: goalName(t, archivedGoal) })
                      : null
                  }
                  polyline={activity && !activity.indoor ? activity.polyline : null}
                />
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function HistoryCard({
  entry,
  planLabel,
  polyline,
}: {
  entry: HistoryEntry;
  /** Set for sessions of an archived plan: labelled, and read-only (no workout screen). */
  planLabel: string | null;
  polyline: string | null;
}) {
  const { t, i18n } = useTranslation();
  const { distance } = useUnits();
  const { colors } = useTheme();
  const w = entry.workout;
  const figures = [
    entry.km > 0 ? distance(entry.km) : null,
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
  const subtitle = [day, typeName(t, w.type), planLabel].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole={planLabel ? undefined : 'button'}
      accessibilityLabel={[title, typeName(t, w.type), day, planLabel, ...figures]
        .filter(Boolean)
        .join(', ')}
      disabled={planLabel !== null}
      onPress={() => router.push(`/training/workout/${encodeURIComponent(w.id)}`)}
      style={({ pressed }) => [
        styles.history,
        { backgroundColor: pressed ? colors.surface2 : colors.surface },
      ]}
      testID={`history-${entry.planId}-${w.id}`}
    >
      <View style={[styles.bar, { backgroundColor: typeColor(colors, w) }]} />
      {polyline ? (
        <RouteShape
          track={polyline}
          size={44}
          color={typeColor(colors, w)}
          testID={`history-route-${w.id}`}
        />
      ) : null}
      <View style={styles.flex}>
        <Text style={styles.strong}>{title}</Text>
        <Text variant="caption" tone="secondary">
          {subtitle}
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
  const { distance } = useUnits();
  return (
    <TileGrid>
      <StatTile
        testID={`${prefix}-sessions`}
        value={String(totals.sessions)}
        label={t('progress.tiles.sessions')}
      />
      <StatTile value={hoursText(t, totals.minutes)} label={t('progress.tiles.time')} />
      <StatTile value={distance(totals.km, 0)} label={t('progress.tiles.distance')} />
      <StatTile value={String(Math.round(totals.load))} label={t('progress.tiles.load')} />
    </TileGrid>
  );
}

function Performance({
  sources,
  scope,
  period,
  onPeriod,
}: {
  sources: Sources;
  scope: Scope;
  period: Period;
  onPeriod: (p: Period) => void;
}) {
  const { t, i18n } = useTranslation();
  const { distance } = useUnits();
  const perf = performance(
    scope === 'plan' ? sources.current : sources.all,
    todayIso(),
    period,
    sources.all,
  );
  const allTime = sources.archived.length > 0;
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

      {sources.archived.some((a) => a.outcome === 'completed') ? (
        <Text variant="heading">{t('planHistory.badges.title')}</Text>
      ) : null}
      <BadgeShelf archived={sources.archived} />

      <Text variant="heading">{allTime ? t('progress.bestsAllTime') : t('progress.bests')}</Text>
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
              value={distance(longestKm[s] ?? 0)}
            />
          ))}
          <Text variant="caption" tone="secondary">
            {t('progress.bestsHint')}
          </Text>
        </Card>
      )}

      <Text variant="heading">
        {allTime ? t('progress.lifetimeAllPlans') : t('progress.lifetime')}
      </Text>
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
  best: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.xs },
});
