import { activePause, statusOf, weekTags, type PlanState, type Workout } from '@peakr/engine';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { todayIso } from '@/data/ids';
import { Button, Card, Icon, ListState, spacing, Text, useTheme } from '@/ui';
import { sessionDoneHaptic } from '@/ui/haptics';

import { useAccess } from '../billing/billing-store';
import { LockedCard } from '../billing/locked';
import { formatDate, initialWeek, mondayOf, weekOfPlan } from '../plan/calendar';
import { WeekProgressCard } from '../plan/components/week-progress-card';
import { WeekStrip } from '../plan/components/week-strip';
import { WorkoutCard } from '../plan/components/workout-card';
import { usePlanUiStore } from '../plan/plan-ui-store';
import { usePlan, usePlanActions } from '../plan/queries';
import { CoachTeaser } from '../body/components/coach-teaser';
import { EnergyTodayCard } from '../body/components/energy-today-card';
import { RecoveryLine } from '../insights/health/recovery-line';
import { useRemoteFlag } from '@/config/remote-flags';
import { WeatherChip } from '../weather/components/weather-chip';
import { WeatherHintCard } from '../weather/components/weather-hint-card';
import { useWorkoutWeather } from '../weather/queries';

const workoutHref = (id: string) => `/training/workout/${encodeURIComponent(id)}` as const;

/**
 * Today: the week strip, today's session(s), the week's progress, insights and one primary action
 * (open today's session, or look at the week on a rest day).
 */
export function TodayScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { data: stored, isPending, isError, refetch } = usePlan();
  const actions = usePlanActions();
  const showWeek = usePlanUiStore((s) => s.showWeek);
  const access = useAccess();
  const body = useRemoteFlag('addon_body_nutrition');
  const today = todayIso();

  const title = (
    <View>
      <Text variant="caption" tone="secondary">
        {formatDate(today, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
      </Text>
      <Text variant="title" accessibilityRole="header">
        {t('today.title')}
      </Text>
    </View>
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
          <ListState
            kind="empty"
            icon="calendar"
            title={t('plan.empty')}
            actionLabel={t('plan.startQuiz')}
            onAction={() => router.push('/onboarding')}
          />
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
  const monday = initialWeek(plan, today);
  const week = weekOfPlan(plan, monday);
  const todays = (week?.workouts ?? []).filter((w) => w.date === today);
  const sessions = todays.filter((w) => w.role !== 'commute');
  const commutes = todays.filter((w) => w.role === 'commute');
  const next = sessions.find((w) => statusOf(state, w.id) === 'planned') ?? null;
  const pause = activePause(state);
  const notStarted = today < (plan.weeks[0]?.startDate ?? today);

  const markDone = (w: Workout) => {
    const result = actions.setStatus(w.id, 'done');
    if (result.ok) sessionDoneHaptic();
  };

  return (
    <Shell>
      {title}
      {access === 'readOnly' ? <LockedCard access={access} /> : null}
      <WeekStrip
        monday={monday}
        today={today}
        state={state}
        onSelectDay={() => {
          showWeek(monday);
          router.push('/plan');
        }}
      />
      <WeatherChip date={today} />

      {pause ? (
        <Card testID="pause-banner">
          <View style={styles.inline}>
            <Icon name="pause" size={22} color={colors.warning} />
            <Text style={styles.flex}>
              {t('plan.pauseBanner', {
                date: formatDate(pause.startDate, i18n.language, { day: 'numeric', month: 'long' }),
                reason: t(`plan.pause.reasons.${pause.reason}`),
              })}
            </Text>
          </View>
        </Card>
      ) : null}

      <Text variant="heading">{t('today.session')}</Text>
      {notStarted ? (
        <Card>
          <Text>
            {t('today.startsOn', {
              date: formatDate(monday, i18n.language, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }),
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
            </View>
          </View>
        </Card>
      ) : (
        sessions.map((w) => (
          <View key={w.id} style={styles.session}>
            <WorkoutCard
              workout={w}
              status={statusOf(state, w.id)}
              profile={input.profile}
              outline={false}
              onPress={() => router.push(workoutHref(w.id))}
            />
            <SessionWeatherHint workout={w} />
            {statusOf(state, w.id) === 'planned' ? <RecoveryLine workout={w} /> : null}
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

      {week ? (
        <>
          <Text variant="heading">{t('today.week')}</Text>
          <WeekProgressCard
            week={week}
            state={state}
            profile={input.profile}
            totalWeeks={plan.weeks.length}
            tags={weekTags(week, input, plan.targetDate)}
            header={false}
          />
          {/* Body add-on teaser for users without it: only adds, Today works the same. */}
          <CoachTeaser />
        </>
      ) : null}

      {/* Body add-on: only adds; Today works the same without it. */}
      <EnergyTodayCard />

      <Text variant="heading">{t('today.insights')}</Text>
      <View style={styles.insights} testID="insights">
        {(['load', 'zones'] as const).map((key) => (
          <Card key={key} style={styles.insight}>
            <Icon name="sparkles" size={20} color={colors.textMuted} />
            <Text style={styles.strong}>{t(`today.insight.${key}.title`)}</Text>
            <Text variant="caption" tone="secondary">
              {t(`today.insight.${key}.body`)}
            </Text>
          </Card>
        ))}
      </View>
      {body ? (
        <Button
          variant="secondary"
          small
          icon="progress"
          label={t('today.openInsights')}
          onPress={() => router.push('/training/insights')}
        />
      ) : null}

      {next && access === 'full' ? (
        <View style={styles.actions}>
          <Button label={t('today.markDone')} icon="check" onPress={() => markDone(next)} />
          <Button
            variant="secondary"
            label={t('today.openSession')}
            onPress={() => router.push(workoutHref(next.id))}
          />
        </View>
      ) : (
        <Button
          label={t('today.seeWeek')}
          icon="calendar"
          onPress={() => {
            showWeek(monday);
            router.push('/plan');
          }}
        />
      )}
    </Shell>
  );
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
