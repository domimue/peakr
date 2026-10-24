import { activePause, weekTags, type PlanWeek } from '@peakr/engine';
import { router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { todayIso } from '@/data/ids';
import type { StoredPlan } from '@/data/repositories/plan-repository';
import { useAccess } from '@/features/billing/billing-store';
import { LockedCard } from '@/features/billing/locked';
import { Badge, ListState, SegmentedControl, spacing, Text, useTheme } from '@/ui';

import { formatDate, initialWeek } from '../calendar';
import { CalendarView } from '../components/calendar-view';
import { WeekProgressCard } from '../components/week-progress-card';
import { usePlanUiStore, type PlanView } from '../plan-ui-store';
import { usePlan } from '../queries';

/**
 * The Plan tab: a segmented control switches between the week list and the day-by-day calendar
 * (CLAUDE.md "UI patterns"). The chosen view survives switching tabs and opening a workout.
 */
export function PlanScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: stored, isPending, isError, refetch } = usePlan();
  const view = usePlanUiStore((s) => s.view);
  const setView = usePlanUiStore((s) => s.setView);
  const access = useAccess();
  // Without a subscription only week 1 is shown (the free preview), as a list.
  const preview = access === 'preview' || access === 'pending';

  const options: { value: PlanView; label: string }[] = [
    { value: 'weeks', label: t('plan.views.weeks') },
    { value: 'calendar', label: t('plan.views.calendar') },
  ];
  const header = (
    <View style={styles.head}>
      <Text variant="title" accessibilityRole="header">
        {t('plan.title')}
      </Text>
      {preview ? null : <SegmentedControl options={options} value={view} onChange={setView} />}
    </View>
  );

  let content: ReactNode;
  if (isPending || isError || !stored) {
    content = (
      <View style={styles.content}>
        {header}
        {isPending ? (
          <ListState kind="loading" label={t('common.loading')} />
        ) : isError ? (
          <ListState
            kind="error"
            title={t('common.loadError')}
            retryLabel={t('common.retry')}
            onRetry={() => void refetch()}
          />
        ) : (
          <ListState
            kind="empty"
            icon="calendar"
            title={t('plan.empty')}
            actionLabel={t('plan.startQuiz')}
            onAction={() => router.push('/onboarding')}
          />
        )}
      </View>
    );
  } else if (preview) {
    content = <WeeksView stored={stored} header={header} preview={access} />;
  } else if (view === 'calendar') {
    content = <CalendarView stored={stored} header={header} />;
  } else {
    content = <WeeksView stored={stored} header={header} />;
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.bg }]}>
      {content}
    </SafeAreaView>
  );
}

/**
 * Plan → weeks: one card per week (date range, "Week 3 of 12", the session types in words with
 * their colours, progress, sessions and km done / planned, recovery / travel / race tags). Each
 * week expands to its days and sessions; the current week starts expanded.
 */
function WeeksView({
  stored,
  header,
  preview,
}: {
  stored: StoredPlan;
  header: ReactNode;
  /** Free preview: week 1 only, then the way to the paywall. */
  preview?: 'preview' | 'pending';
}) {
  const { t, i18n } = useTranslation();
  const showWeek = usePlanUiStore((s) => s.showWeek);
  const list = useRef<FlatList<PlanWeek>>(null);
  const scrolled = useRef(false);
  // Weeks the user opened or closed; the current week starts open.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const today = todayIso();

  const { state, input } = stored;
  const { plan } = state;
  const current = initialWeek(plan, today);
  const currentIndex = Math.max(
    0,
    plan.weeks.findIndex((w) => w.startDate === current),
  );
  const pause = activePause(state);
  const isOpen = (start: string) => (start === current) !== toggled.has(start);
  const toggle = (start: string) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (!next.delete(start)) next.add(start);
      return next;
    });
  const goal = plan.targetDate
    ? t('plan.goalLine', {
        goal: t(`quiz.goal.options.${plan.goal.kind}.label` as never),
        date: formatDate(plan.targetDate, i18n.language, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      })
    : (t(`quiz.goal.options.${plan.goal.kind}.label` as never) as string);

  return (
    <FlatList
      ref={list}
      testID="plan-weeks"
      data={preview ? plan.weeks.slice(0, 1) : plan.weeks}
      keyExtractor={(w) => w.startDate}
      extraData={toggled}
      // Start at the current week (once, after the first layout).
      onContentSizeChange={() => {
        if (scrolled.current || currentIndex === 0 || preview) return;
        scrolled.current = true;
        list.current?.scrollToIndex({ index: currentIndex, animated: false, viewOffset: 16 });
      }}
      onScrollToIndexFailed={({ index, averageItemLength }) =>
        list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false })
      }
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={
        <View style={styles.listHead}>
          {header}
          <Text tone="secondary">{goal}</Text>
          {pause ? <Badge label={t('plan.pausedBadge')} /> : null}
        </View>
      }
      ListEmptyComponent={<ListState kind="empty" title={t('plan.noWeeks')} />}
      ListFooterComponent={
        preview ? (
          <View style={styles.footer}>
            <Text variant="caption" tone="secondary">
              {t('locked.weekOne')}
            </Text>
            <LockedCard access={preview} />
          </View>
        ) : undefined
      }
      renderItem={({ item: week }) => (
        <WeekProgressCard
          week={week}
          state={state}
          profile={input.profile}
          totalWeeks={plan.weeks.length}
          tags={weekTags(week, input, plan.targetDate)}
          header
          isCurrent={week.startDate === current}
          expanded={preview ? true : isOpen(week.startDate)}
          onToggle={() => toggle(week.startDate)}
          today={today}
          onOpenWorkout={(id) => router.push(`/training/workout/${encodeURIComponent(id)}`)}
          onOpenCalendar={preview ? undefined : () => showWeek(week.startDate)}
        />
      )}
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  head: { gap: spacing.md },
  listHead: { gap: spacing.sm, marginBottom: spacing.md },
  separator: { height: spacing.sm },
  footer: { gap: spacing.sm, marginTop: spacing.md },
});
