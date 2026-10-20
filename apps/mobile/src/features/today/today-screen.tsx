import { activePause, statusOf, weekTags, type PlanState, type Workout } from '@peakr/engine';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { todayIso } from '@/data/ids';
import { Button, Card, Icon, ListState, radius, spacing, Text, useTheme } from '@/ui';
import { sessionDoneHaptic } from '@/ui/haptics';

import { formatDate, initialWeek, weekOfPlan } from '../plan/calendar';
import { WeekProgressCard } from '../plan/components/week-progress-card';
import { WeekStrip } from '../plan/components/week-strip';
import { WorkoutCard } from '../plan/components/workout-card';
import { usePlanUiStore } from '../plan/plan-ui-store';
import { usePlan, usePlanActions } from '../plan/queries';

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
      <WeekStrip
        monday={monday}
        today={today}
        state={state}
        onSelectDay={() => {
          showWeek(monday);
          router.push('/plan');
        }}
      />
      <WeatherChip />

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
          <WorkoutCard
            key={w.id}
            workout={w}
            status={statusOf(state, w.id)}
            profile={input.profile}
            outline={false}
            onPress={() => router.push(workoutHref(w.id))}
          />
        ))
      )}

      {commutes.length > 0 && !pause ? (
        <CommuteCard commutes={commutes} state={state} onToggle={actions.setStatus} />
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
        </>
      ) : null}

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

      {next ? (
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

/** Weather comes with the weather check (later phase); the chip shows where it will appear. */
function WeatherChip() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      style={[styles.chip, { borderColor: colors.border }]}
      accessible
      accessibilityLabel={t('today.weatherSoon')}
      testID="weather-chip"
    >
      <Icon name="weather" size={16} color={colors.textMuted} />
      <Text variant="caption" tone="secondary">
        {t('today.weatherSoon')}
      </Text>
    </View>
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  insights: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  insight: { flexGrow: 1, flexBasis: 160 },
  actions: { gap: spacing.sm },
});
