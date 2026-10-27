import {
  activePause,
  statusOf,
  weekProgress,
  type HrZone,
  type PlanState,
  type PlanWeek,
  type UserProfile,
  type Workout,
} from '@peakr/engine';
import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { todayIso } from '@/data/ids';
import { Button, Card, Icon, IconButton, ListState, spacing, Text, useTheme } from '@/ui';
import { planTargetBands } from '@/features/training-zones/resolve';
import { sessionDoneHaptic } from '@/ui/haptics';

import { MatchQuestionCards } from '../activities/match-question-card';
import { useAccess } from '../billing/billing-store';
import { LockedCard } from '../billing/locked';
import { addDays, formatDate, mondayOf, weekOfPlan } from '../plan/calendar';
import { WeekStrip } from '../plan/components/week-strip';
import { calendarTitle, typeName } from '../plan/kind';
import { usePlanUiStore } from '../plan/plan-ui-store';
import { usePlan, usePlanActions } from '../plan/queries';
import { CoachTeaser } from '../body/components/coach-teaser';
import { EnergyTodayCard } from '../body/components/energy-today-card';
import { RecoveryLine } from '../insights/health/recovery-line';
import { useArchiveEndedPlan } from '@/features/plan-new/ended';
import { NoPlanState } from '@/features/plan-new/no-plan-state';
import { TabTitle } from '@/features/profile/profile-button';
import { DaySession, workoutHref } from './day-session';
import { WeatherChip } from '../weather/components/weather-chip';
import { WeatherHintCard } from '../weather/components/weather-hint-card';
import { useWorkoutWeather } from '../weather/queries';

/**
 * Today shows exactly one day (CLAUDE.md "UI patterns → Today"): the week strip is the day
 * switcher – tapping a date swaps the content below, it never leaves Today – and "Back to today"
 * returns. The selected day shows its session in full (type, duration range, bpm band, route,
 * steps, why) or a rest-day card with the next session; the week is one small line below.
 */
export function TodayScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { data: stored, isPending, isError, refetch } = usePlan();
  useArchiveEndedPlan();
  const actions = usePlanActions();
  const access = useAccess();
  const today = todayIso();
  const [selected, setSelected] = useState(today);
  // Manual zones from Profile → Training zones included.
  const hrZones = useMemo<readonly HrZone[]>(() => planTargetBands(stored?.input), [stored?.input]);

  const title = (
    <TabTitle
      title={t('today.title')}
      above={
        <Text variant="caption" tone="secondary">
          {formatDate(today, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
      }
    />
  );

  if (isPending || isError || !stored) {
    return (
      <Shell>
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
          <NoPlanState />
        )}
      </Shell>
    );
  }

  // No subscription yet: week 1 (on the Plan tab) and the paywall, nothing else.
  if (access === 'preview' || access === 'pending') {
    return (
      <Shell>
        {title}
        <LockedCard access={access} />
        {access === 'preview' ? (
          <Button
            variant="secondary"
            label={t('today.seeWeekOne')}
            onPress={() => router.push('/plan')}
          />
        ) : null}
      </Shell>
    );
  }

  const { state, input } = stored;
  const { plan } = state;
  const firstMonday = plan.weeks[0]?.startDate ?? mondayOf(today);
  const lastMonday = plan.weeks[plan.weeks.length - 1]?.startDate ?? mondayOf(today);
  const monday = mondayOf(selected);
  const week = weekOfPlan(plan, monday);
  const isToday = selected === today;
  const ofDay = (week?.workouts ?? []).filter((w) => w.date === selected);
  const sessions = ofDay.filter((w) => w.role !== 'commute');
  const commutes = ofDay.filter((w) => w.role === 'commute');
  const pause = activePause(state);
  const notStarted = selected < (plan.weeks[0]?.startDate ?? selected);
  const upcoming = plan.weeks
    .flatMap((w) => w.workouts)
    .find((w) => w.date > selected && w.role !== 'commute' && statusOf(state, w.id) === 'planned');
  const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    formatDate(iso, i18n.language, opts);

  const markDone = (w: Workout) => {
    const result = actions.setStatus(w.id, 'done');
    if (result.ok) sessionDoneHaptic();
  };
  const shiftWeek = (days: number) => setSelected(addDays(selected, days));

  return (
    <Shell>
      {title}
      {access === 'readOnly' ? <LockedCard access={access} /> : null}
      <View style={styles.inline}>
        <IconButton
          icon="chevronLeft"
          accessibilityLabel={t('today.previousWeek')}
          disabled={monday <= firstMonday}
          onPress={() => shiftWeek(-7)}
        />
        <View style={styles.flex}>
          <WeekStrip
            monday={monday}
            today={today}
            selected={selected}
            state={state}
            onSelectDay={setSelected}
          />
        </View>
        <IconButton
          icon="chevronRight"
          accessibilityLabel={t('today.nextWeek')}
          disabled={monday >= lastMonday}
          onPress={() => shiftWeek(7)}
        />
      </View>
      {/* The dots' colours in words: what is planned on the selected day. */}
      <View style={styles.inline} testID="day-legend">
        <Text variant="label" style={styles.flex}>
          {isToday
            ? t('today.title')
            : dayLabel(selected, { weekday: 'long', day: 'numeric', month: 'long' })}
          {' · '}
          {sessions.length === 0
            ? t('plan.rest')
            : sessions.map((w) => typeName(t, w.type)).join(' · ')}
        </Text>
        {isToday ? null : (
          <Button
            small
            variant="secondary"
            icon="undo"
            label={t('today.backToToday')}
            onPress={() => setSelected(today)}
          />
        )}
      </View>
      <WeatherChip date={selected} />

      {pause ? (
        <Card testID="pause-banner">
          <View style={styles.inline}>
            <Icon name="pause" size={22} color={colors.warning} />
            <Text style={styles.flex}>
              {t('plan.pauseBanner', {
                date: dayLabel(pause.startDate, { day: 'numeric', month: 'long' }),
                reason: t(`plan.pause.reasons.${pause.reason}`),
              })}
            </Text>
          </View>
        </Card>
      ) : null}

      {notStarted ? (
        <Card>
          <Text>
            {t('today.startsOn', {
              date: dayLabel(firstMonday, { weekday: 'long', day: 'numeric', month: 'long' }),
            })}
          </Text>
        </Card>
      ) : sessions.length === 0 ? (
        <Card testID="today-rest">
          <View style={styles.inline}>
            <Icon name="easy" size={22} color={colors.textMuted} />
            <View style={styles.flex}>
              <Text style={styles.strong}>{t('today.restTitle')}</Text>
              <Text tone="secondary">{t('today.restHint')}</Text>
              {upcoming ? (
                <Text tone="secondary" testID="rest-next">
                  {t('today.next', {
                    session: calendarTitle(t, upcoming),
                    day: dayLabel(upcoming.date, { weekday: 'long' }),
                  })}
                </Text>
              ) : null}
            </View>
          </View>
        </Card>
      ) : (
        sessions.map((w) => (
          <View key={w.id} style={styles.session}>
            <DaySession
              workout={w}
              status={statusOf(state, w.id)}
              profile={input.profile}
              hrZones={hrZones}
              canMarkDone={access === 'full' && w.date <= today}
              onMarkDone={() => markDone(w)}
            />
            <SessionWeatherHint workout={w} />
            {statusOf(state, w.id) === 'planned' && isToday ? <RecoveryLine workout={w} /> : null}
          </View>
        ))
      )}

      {commutes.length > 0 && !pause ? (
        <>
          <CommuteCard commutes={commutes} state={state} onToggle={actions.setStatus} />
          {/* Both ways of a commute share the weather: one hint is enough. */}
          {commutes[0] ? <SessionWeatherHint workout={commutes[0]} /> : null}
        </>
      ) : null}

      {/* The week in one line below the day – not the main content. */}
      {week ? <WeekLine week={week} state={state} profile={input.profile} /> : null}

      {/* Body add-on: only adds; Today works the same without it. */}
      <MatchQuestionCards />
      <EnergyTodayCard />
      <CoachTeaser />
    </Shell>
  );
}

/** "This week: 3 of 5 sessions · 2 h 10 min of 4 h 30 min" – one small line. */
function WeekLine({
  week,
  state,
  profile,
}: {
  week: PlanWeek;
  state: PlanState;
  profile: UserProfile;
}) {
  const { t } = useTranslation();
  const p = weekProgress(state, week, profile);
  return (
    <Text variant="caption" tone="secondary" testID="today-week-line">
      {t('today.weekLine', {
        done: p.sessionsDone,
        planned: p.sessionsPlanned,
        time: formatMinutes(t, p.minutesDone),
        total: formatMinutes(t, p.minutesPlanned),
      })}
    </Text>
  );
}

function formatMinutes(t: TFunction, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? t('progress.hoursMinutes', { h, m }) : t('workoutText.minutes', { count: m });
}

function Shell({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} testID="today-scroll">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** The weather hint under a session, with its options wired to the plan. */
function SessionWeatherHint({ workout }: { workout: Workout }) {
  const weather = useWorkoutWeather(workout);
  const actions = usePlanActions();
  const setFeedback = usePlanUiStore((s) => s.setFeedback);
  const showWeek = usePlanUiStore((s) => s.showWeek);
  if (!weather) return null;
  return (
    <WeatherHintCard
      workout={workout}
      weather={weather}
      onIndoor={() => router.push(`${workoutHref(workout.id)}?setting=indoor`)}
      onMove={(date) => {
        const result = actions.move(workout.id, date);
        if (!result.ok) return;
        const { warnings, suggestion } = result.value;
        setFeedback(
          warnings.length > 0 || suggestion
            ? { workoutId: workout.id, toDate: date, warnings, suggestion }
            : null,
        );
        showWeek(mondayOf(date));
        router.push('/plan');
      }}
      onPickDay={() => router.push(`${workoutHref(workout.id)}?move=1`)}
      onSkip={() => actions.setStatus(workout.id, 'skipped')}
    />
  );
}

function CommuteCard({
  commutes,
  state,
  onToggle,
}: {
  commutes: Workout[];
  state: PlanState;
  onToggle: (id: string, status: 'planned' | 'skipped') => unknown;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card testID="commute-today">
      <View style={styles.inline}>
        <Icon name="commute" size={22} color={colors.typeCommute} />
        <Text style={[styles.strong, styles.flex]}>{t('plan.realLife.commuteToday')}</Text>
      </View>
      {commutes.map((c) => {
        const skipped = statusOf(state, c.id) === 'skipped';
        return (
          <View key={c.id} style={styles.inline}>
            <Text tone={skipped ? 'secondary' : undefined} style={styles.flex}>
              {skipped
                ? t('plan.realLife.commuteSkipped')
                : t('plan.realLife.commuteLine', {
                    type: t(`plan.sports.${c.sport}` as never),
                    minutes: c.durationMin,
                  })}
            </Text>
            <Button
              small
              variant="secondary"
              icon={skipped ? 'undo' : 'skip'}
              label={t(skipped ? 'plan.realLife.undoSkip' : 'plan.realLife.skipCommute')}
              onPress={() => onToggle(c.id, skipped ? 'planned' : 'skipped')}
            />
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  strong: { fontWeight: '600' },
  session: { gap: spacing.sm },
  insights: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  insight: { flexGrow: 1, flexBasis: 160 },
  actions: { gap: spacing.sm },
});
