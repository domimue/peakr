import {
  activePause,
  hasManualChanges,
  weekProgress,
  weekTags,
  type PlanInput,
  type PlanState,
  type PlanWeek,
} from '@peakr/engine';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { todayIso } from '@/data/ids';
import { Badge, Button, Card, Icon, IconButton, ListState, spacing, Text, useTheme } from '@/ui';

import { addDays, formatDate, initialWeek } from '../calendar';
import { MoveFeedbackCard } from '../components/move-feedback';
import { WeekView } from '../components/week-view';
import { usePlanUiStore } from '../plan-ui-store';
import { usePlan, usePlanActions } from '../queries';
import { issueText } from './plan-screen';

/** Weeks shown at once; the arrows page by one week. */
const WEEKS_SHOWN = 4;

const workoutHref = (id: string) => `/training/workout/${encodeURIComponent(id)}` as const;

/**
 * The Calendar tab: weeks as sections with their totals, one row per day, compact session chips in
 * the type colour, "add" on empty days, drag & drop to move a session (the engine only warns) and
 * "reset week" to undo manual moves.
 */
export function CalendarScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: stored, isPending, isError, refetch } = usePlan();
  const actions = usePlanActions();
  const { weekStart, feedback, showWeek, setFeedback } = usePlanUiStore();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();

  const title = (
    <Text variant="title" accessibilityRole="header">
      {t('calendar.title')}
    </Text>
  );

  if (isPending || isError || !stored) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.bg }]}>
        <View style={styles.content}>
          {title}
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
  const first = plan.weeks[0]?.startDate ?? current;
  const lastIndex = plan.weeks.length - 1;
  const start = weekStart ?? current;
  const startIndex = Math.max(
    0,
    plan.weeks.findIndex((w) => w.startDate === start),
  );
  const shown = plan.weeks.slice(startIndex, startIndex + WEEKS_SHOWN);
  const pause = activePause(state);

  const move = (id: string, toDate: string) => {
    const result = actions.move(id, toDate);
    if (!result.ok) {
      setError(issueText(t, result.issues));
      return;
    }
    setError(null);
    const { warnings, suggestion } = result.value;
    setFeedback(
      warnings.length > 0 || suggestion ? { workoutId: id, toDate, warnings, suggestion } : null,
    );
  };

  const reset = (monday: string) => {
    const result = actions.resetWeek(monday);
    setError(result.ok ? null : issueText(t, result.issues));
    setFeedback(null);
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView
        testID="calendar-scroll"
        scrollEnabled={!dragging}
        contentContainerStyle={styles.content}
      >
        {title}
        <View style={styles.nav}>
          <IconButton
            icon="chevronLeft"
            accessibilityLabel={t('plan.prevWeek')}
            disabled={start <= first}
            onPress={() => showWeek(addDays(start, -7))}
          />
          <View style={styles.flex} />
          {start !== current ? (
            <Button
              small
              variant="secondary"
              icon="calendar"
              label={t('plan.today')}
              onPress={() => showWeek(current)}
            />
          ) : null}
          <IconButton
            icon="chevronRight"
            accessibilityLabel={t('plan.nextWeek')}
            disabled={startIndex >= lastIndex}
            onPress={() => showWeek(addDays(start, 7))}
          />
        </View>

        {error ? (
          <Card>
            <Text style={{ color: colors.errorText }}>{error}</Text>
          </Card>
        ) : null}

        {feedback ? (
          <MoveFeedbackCard
            feedback={feedback}
            plan={plan}
            onEase={(ids) => {
              const result = actions.ease(ids);
              if (!result.ok) setError(issueText(t, result.issues));
              setFeedback(null);
            }}
            onApply={() => {
              if (feedback.suggestion) actions.apply(feedback.suggestion.state);
              setFeedback(null);
            }}
            onDismiss={() => setFeedback(null)}
          />
        ) : null}

        {shown.map((week, k) => (
          <WeekSection
            key={week.startDate}
            week={week}
            state={state}
            input={input}
            targetDate={plan.targetDate}
            totalWeeks={plan.weeks.length}
            canReset={hasManualChanges(state, week.startDate)}
            paused={pause !== null}
            onReset={() => reset(week.startDate)}
          >
            <WeekView
              idPrefix={k === 0 ? 'plan' : `plan-w${k}`}
              monday={week.startDate}
              today={today}
              state={state}
              profile={input.profile}
              onOpen={(id) => router.push(workoutHref(id))}
              onMove={move}
              onMoveAction={(id) => router.push(`${workoutHref(id)}?move=1`)}
              onDragChange={setDragging}
              onAdd={() => router.push('/coming-soon/addSession')}
            />
          </WeekSection>
        ))}

        <View style={styles.inline}>
          <Icon name="info" size={16} color={colors.textMuted} />
          <Text variant="caption" tone="secondary" style={styles.flex}>
            {t('plan.dragHint')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface WeekSectionProps {
  week: PlanWeek;
  state: PlanState;
  input: PlanInput;
  targetDate: string | null;
  totalWeeks: number;
  canReset: boolean;
  paused: boolean;
  onReset: () => void;
  children: ReactNode;
}

/** One week: range, "Week 3 of 12", the week's total, tags, the days and the week actions. */
function WeekSection({
  week,
  state,
  input,
  targetDate,
  totalWeeks,
  canReset,
  paused,
  onReset,
  children,
}: WeekSectionProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const p = weekProgress(state, week, input.profile);
  const tags = weekTags(week, input, targetDate);
  const date = (iso: string) => formatDate(iso, i18n.language, { day: 'numeric', month: 'short' });
  const totals = [
    t('workoutText.minutesRange', { min: p.minMin, max: p.maxMin }),
    p.kmPlanned > 0 ? t('plan.km', { value: Math.round(p.kmPlanned) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={styles.section} testID={`calendar-week-${week.index}`}>
      <View style={[styles.sectionHead, { borderBottomColor: colors.border }]}>
        <View style={styles.flex}>
          <Text variant="label" accessibilityRole="header">
            {`${date(week.startDate)} – ${date(addDays(week.startDate, 6))}`}
          </Text>
          <Text variant="caption" tone="secondary">
            {`${t('plan.weekOf', { week: week.index + 1, total: totalWeeks })} · ${t(`plan.phases.${week.phase}`)}`}
          </Text>
        </View>
        <View
          style={styles.total}
          accessible
          accessibilityLabel={t('calendar.weekTotal', { value: totals })}
        >
          <Text variant="label">{totals}</Text>
        </View>
      </View>
      {tags.length > 0 ? (
        <View style={styles.tags}>
          {tags.map((tag) => (
            <Badge key={tag} label={t(`plan.tags.${tag}`)} />
          ))}
        </View>
      ) : null}
      {children}
      <View style={styles.sectionActions}>
        {canReset ? (
          <Button
            small
            variant="secondary"
            icon="reset"
            label={t('calendar.resetWeek')}
            onPress={onReset}
          />
        ) : null}
        {paused ? null : (
          <Button
            small
            variant="secondary"
            icon="tune"
            label={t('plan.realLife.weekDifferent')}
            onPress={() => router.push(`/training/week?start=${week.startDate}`)}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  section: { gap: spacing.sm },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  total: { alignItems: 'flex-end' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  sectionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
