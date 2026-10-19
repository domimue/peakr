import { activePause, weekTags, type EditIssue, type PlanWeek } from '@peakr/engine';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { todayIso } from '@/data/ids';
import { Badge, ListState, spacing, Text, useTheme } from '@/ui';

import { formatDate, initialWeek } from '../calendar';
import { WeekProgressCard } from '../components/week-progress-card';
import { usePlanUiStore } from '../plan-ui-store';
import { usePlan } from '../queries';

/** First issue of an engine edit as a message. */
export function issueText(t: TFunction, issues: readonly EditIssue[]): string {
  const code = issues[0]?.code ?? 'generic';
  return t(`plan.errors.${code}` as never, { defaultValue: t('plan.errors.generic') }) as string;
}

/**
 * The Plan tab: one card per week (date range, "Week 3 of 12", the session types in words with
 * their colours, progress, sessions and km done / planned, recovery / travel / race tags). Each
 * week expands to its days and sessions; the current week starts expanded.
 */
export function PlanScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { data: stored, isPending, isError, refetch } = usePlan();
  const showWeek = usePlanUiStore((s) => s.showWeek);
  const list = useRef<FlatList<PlanWeek>>(null);
  const scrolled = useRef(false);
  // Weeks the user opened or closed; the current week starts open.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const today = todayIso();

  const header = (
    <Text variant="title" accessibilityRole="header">
      {t('plan.title')}
    </Text>
  );

  if (isPending || isError || !stored) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.bg }]}>
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
      </SafeAreaView>
    );
  }

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
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.bg }]}>
      <FlatList
        ref={list}
        testID="plan-weeks"
        data={plan.weeks}
        keyExtractor={(w) => w.startDate}
        extraData={toggled}
        // Start at the current week (once, after the first layout).
        onContentSizeChange={() => {
          if (scrolled.current || currentIndex === 0) return;
          scrolled.current = true;
          list.current?.scrollToIndex({ index: currentIndex, animated: false, viewOffset: 16 });
        }}
        onScrollToIndexFailed={({ index, averageItemLength }) =>
          list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false })
        }
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <View style={styles.head}>
            {header}
            <Text tone="secondary">{goal}</Text>
            {pause ? <Badge label={t('plan.pausedBadge')} /> : null}
          </View>
        }
        ListEmptyComponent={<ListState kind="empty" title={t('plan.noWeeks')} />}
        renderItem={({ item: week }) => (
          <WeekProgressCard
            week={week}
            state={state}
            profile={input.profile}
            totalWeeks={plan.weeks.length}
            tags={weekTags(week, input, plan.targetDate)}
            header
            isCurrent={week.startDate === current}
            expanded={isOpen(week.startDate)}
            onToggle={() => toggle(week.startDate)}
            today={today}
            onOpenWorkout={(id) => router.push(`/training/workout/${encodeURIComponent(id)}`)}
            onOpenCalendar={() => {
              showWeek(week.startDate);
              router.push('/calendar');
            }}
          />
        )}
      />
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  head: { gap: spacing.sm, marginBottom: spacing.md },
  separator: { height: spacing.sm },
});
