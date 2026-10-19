import { activePause, type EditIssue } from '@peakr/engine';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { todayIso } from '@/data/ids';
import {
  Badge,
  Button,
  Card,
  Icon,
  IconButton,
  LinkRow,
  numeric,
  SegmentedControl,
  spacing,
  Text,
  useTheme,
} from '@/ui';

import { addDays, addMonths, formatDate, initialWeek, monthStart, weekOfPlan } from '../calendar';
import { MonthView } from '../components/month-view';
import { MoveFeedbackCard } from '../components/move-feedback';
import { WeekSummary } from '../components/week-summary';
import { WeekView } from '../components/week-view';
import { usePlanUiStore, type PlanView } from '../plan-ui-store';
import { usePlan, usePlanActions } from '../queries';

/** First issue of an engine edit as a message. */
export function issueText(t: TFunction, issues: readonly EditIssue[]): string {
  const code = issues[0]?.code ?? 'generic';
  return t(`plan.errors.${code}` as never, { defaultValue: t('plan.errors.generic') }) as string;
}

/**
 * The Plan tab: week view (default, drag & drop to move a workout) and month view, the running
 * pause and the entries to edit availability and pause the plan.
 */
export function PlanScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { data: stored, isPending } = usePlan();
  const actions = usePlanActions();
  const today = todayIso();
  const { view, weekStart, month, feedback, setView, showWeek, showMonth, setFeedback } =
    usePlanUiStore();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isPending) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} />;

  if (!stored) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.bg }]}>
        <View style={styles.content}>
          <Text variant="title" accessibilityRole="header">
            {t('plan.title')}
          </Text>
          <Text tone="secondary">{t('plan.empty')}</Text>
          <Button label={t('plan.startQuiz')} onPress={() => router.push('/onboarding')} />
        </View>
      </SafeAreaView>
    );
  }

  const { state, input } = stored;
  const { plan } = state;
  const monday = weekStart ?? initialWeek(plan, today);
  const shownMonth = month ?? monthStart(today);
  const week = weekOfPlan(plan, monday);
  const firstWeek = plan.weeks[0]?.startDate ?? monday;
  const lastWeek = plan.weeks[plan.weeks.length - 1]?.startDate ?? monday;
  const pause = activePause(state);
  const date = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    formatDate(iso, i18n.language, opts);

  const move = (id: string, toDate: string) => {
    const result = actions.move(id, toDate);
    if (!result.ok) {
      setError(issueText(t, result.issues));
      return;
    }
    setError(null);
    const { warnings, suggestion } = result.value;
    // Nothing to say when the move breaks no rule.
    setFeedback(
      warnings.length > 0 || suggestion ? { workoutId: id, toDate, warnings, suggestion } : null,
    );
  };

  const applySuggestion = () => {
    if (feedback?.suggestion) actions.apply(feedback.suggestion.state);
    setFeedback(null);
  };

  const ease = (ids: string[]) => {
    const result = actions.ease(ids);
    if (!result.ok) setError(issueText(t, result.issues));
    setFeedback(null);
  };

  const viewOptions: { value: PlanView; label: string }[] = [
    { value: 'week', label: t('plan.view.week') },
    { value: 'month', label: t('plan.view.month') },
  ];

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView
        testID="plan-scroll"
        scrollEnabled={!dragging}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text variant="title" accessibilityRole="header">
          {t('plan.title')}
        </Text>
        <SegmentedControl options={viewOptions} value={view} onChange={setView} />

        {pause ? (
          <Card testID="pause-banner">
            <View style={styles.inline}>
              <Icon name="pause" size={22} color={colors.warning} />
              <Text style={[styles.strong, styles.flex]}>
                {t('plan.pauseBanner', {
                  date: date(pause.startDate, { day: 'numeric', month: 'long' }),
                  reason: t(`plan.pause.reasons.${pause.reason}`),
                })}
              </Text>
            </View>
            <Button
              icon="play"
              label={t('plan.pause.resume')}
              onPress={() => router.push('/training/pause')}
            />
          </Card>
        ) : null}

        {error ? (
          <Card>
            <Text style={{ color: colors.errorText }}>{error}</Text>
          </Card>
        ) : null}

        {feedback ? (
          <MoveFeedbackCard
            feedback={feedback}
            plan={plan}
            onEase={ease}
            onApply={applySuggestion}
            onDismiss={() => setFeedback(null)}
          />
        ) : null}

        {view === 'week' ? (
          <>
            <View style={styles.nav}>
              <IconButton
                icon="chevronLeft"
                accessibilityLabel={t('plan.prevWeek')}
                disabled={monday <= firstWeek}
                onPress={() => showWeek(addDays(monday, -7))}
              />
              <View style={styles.navTitle}>
                <Text variant="label" style={numeric}>
                  {`${date(monday, { day: 'numeric', month: 'short' })} – ${date(addDays(monday, 6), { day: 'numeric', month: 'short' })}`}
                </Text>
                {week ? (
                  <Text variant="caption" tone="secondary">
                    {t('plan.weekLabel', {
                      week: week.index + 1,
                      total: plan.weeks.length,
                      phase: t(`plan.phases.${week.phase}`),
                    })}
                  </Text>
                ) : null}
              </View>
              <IconButton
                icon="chevronRight"
                accessibilityLabel={t('plan.nextWeek')}
                disabled={monday >= lastWeek}
                onPress={() => showWeek(addDays(monday, 7))}
              />
            </View>
            {week?.isRecovery || week?.phase === 'taper' || monday !== initialWeek(plan, today) ? (
              <View style={styles.badges}>
                {week?.isRecovery ? <Badge label={t('plan.recoveryWeek')} /> : null}
                {week?.phase === 'taper' ? <Badge label={t('plan.taperWeek')} /> : null}
                <View style={styles.flex} />
                {monday !== initialWeek(plan, today) ? (
                  <Button
                    small
                    variant="secondary"
                    icon="calendar"
                    label={t('plan.today')}
                    onPress={() => showWeek(initialWeek(plan, today))}
                  />
                ) : null}
              </View>
            ) : null}
            {week ? <WeekSummary week={week} state={state} profile={input.profile} /> : null}
            <WeekView
              monday={monday}
              today={today}
              state={state}
              profile={input.profile}
              onOpen={(id) => router.push(`/training/workout/${encodeURIComponent(id)}`)}
              onMove={move}
              onMoveAction={(id) =>
                router.push(`/training/workout/${encodeURIComponent(id)}?move=1`)
              }
              onDragChange={setDragging}
            />
            <View style={styles.inline}>
              <Icon name="info" size={16} color={colors.textMuted} />
              <Text variant="caption" tone="secondary" style={styles.flex}>
                {t('plan.dragHint')}
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.nav}>
              <IconButton
                icon="chevronLeft"
                accessibilityLabel={t('plan.prevMonth')}
                onPress={() => showMonth(addMonths(shownMonth, -1))}
              />
              <Text variant="label" style={styles.navTitle}>
                {date(shownMonth, { month: 'long', year: 'numeric' })}
              </Text>
              <IconButton
                icon="chevronRight"
                accessibilityLabel={t('plan.nextMonth')}
                onPress={() => showMonth(addMonths(shownMonth, 1))}
              />
            </View>
            <MonthView month={shownMonth} today={today} state={state} onSelectWeek={showWeek} />
          </>
        )}

        <Text variant="heading">{t('plan.manage')}</Text>
        <LinkRow
          icon="book"
          title={t('workoutTypes.title')}
          hint={t('workoutTypes.entryHint')}
          onPress={() => router.push('/training/workout-types')}
        />
        <LinkRow
          icon="tune"
          title={t('plan.availability.title')}
          hint={t('plan.availability.entryHint')}
          onPress={() => router.push('/training/availability')}
        />
        {pause ? null : (
          <LinkRow
            icon="pause"
            title={t('plan.pause.title')}
            hint={t('plan.pause.entryHint')}
            onPress={() => router.push('/training/pause')}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  strong: { fontWeight: '600' },
  nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  navTitle: { flex: 1, alignItems: 'center', textAlign: 'center' },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
