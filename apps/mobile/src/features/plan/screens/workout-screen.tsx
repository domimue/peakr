import {
  findWorkout,
  formatDuration,
  inDetailWindow,
  indoorVersion,
  isPaused,
  kindKey,
  paceLimitSecPerKm,
  planRange,
  statusOf,
  treadmillSpeedKmh,
  workoutKind,
  type Block,
  type HrZone,
  type Step,
} from '@peakr/engine';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import { useWorkoutActivity, type LinkedActivity } from '@/features/activities/queries';
import { WorkoutEvaluation, WorkoutRoute } from '@/features/routes/components/workout-route';
import { planHrZones } from '@/features/training-zones/resolve';
import { WeatherHintCard } from '@/features/weather/components/weather-hint-card';
import { useWorkoutWeather } from '@/features/weather/queries';
import {
  Badge,
  Button,
  Card,
  ChipGroup,
  Icon,
  IconBadge,
  LinkRow,
  radius,
  Screen,
  SegmentedControl,
  spacing,
  Text,
  useTheme,
  type IconName,
} from '@/ui';
import { sessionDoneHaptic } from '@/ui/haptics';

import {
  durationText,
  exerciseLines,
  targetText,
  workoutTitle,
} from '../../onboarding/workout-text';
import { addDays, formatDate, mondayOf, weekDates } from '../calendar';
import { workoutKm } from '../components/workout-card';
import { calendarTitle, kindIcon, typeColor, typeName } from '../kind';
import { useHasGym } from '@/features/billing/billing-store';
import { useActiveWorkoutStore } from '@/features/gym/active-workout-store';

import { usePlanUiStore } from '../plan-ui-store';
import { usePlan, usePlanActions } from '../queries';
import { issueText } from '../issue-text';

export interface WorkoutScreenProps {
  id: string;
  /** Opened via "move" (accessibility action): the day picker is shown right away. */
  startMoving?: boolean;
  /** Opened from a weather hint's "indoor" option. */
  initialSetting?: Setting;
}

export type Setting = 'outdoor' | 'indoor';

interface StepItem {
  key: string;
  title: string;
  target: string;
  explanation: string;
}

function amountText(t: TFunction, s: Step): string {
  if (s.distanceM !== undefined) return t('workoutText.meters', { value: s.distanceM });
  const sec = s.durationSec ?? 0;
  return sec % 60 === 0 ? t('workoutText.minutes', { count: sec / 60 }) : formatDuration(sec);
}

/**
 * Numbered steps: every warm-up and cool-down step, every main block (repeats as one step with
 * the work and recovery inside). Each with its target and one line of explanation.
 */
function stepItems(
  t: TFunction,
  parts: { warmup: Step[]; main: Block[]; cooldown: Step[] },
  hrZones: readonly HrZone[],
  paceLimit: string | null,
): StepItem[] {
  const target = (s: Step) => {
    const main = targetText(t, s.target, hrZones);
    return paceLimit && s.zone <= 2
      ? t('workout.paceLimit', { target: main, pace: paceLimit })
      : main;
  };
  const explain = (s: Step, fallback: string) =>
    s.noteKey ? (t(s.noteKey as never) as string) : fallback;
  const items: StepItem[] = [];
  parts.warmup.forEach((s, i) =>
    items.push({
      key: `w${i}`,
      title: `${t('workout.step.warmup')} · ${amountText(t, s)}`,
      target: target(s),
      explanation: explain(s, t('workout.explain.warmup')),
    }),
  );
  parts.main.forEach((b, i) => {
    const work = b.steps.find((s) => !s.rest) ?? b.steps[0];
    const rest = b.steps.find((s) => s.rest);
    if (!work) return;
    const amount =
      b.repeat > 1
        ? t('workout.repeat', {
            count: b.repeat,
            work: amountText(t, work),
            rest: rest ? amountText(t, rest) : '',
          })
        : amountText(t, work);
    items.push({
      key: `m${i}`,
      title: `${t('workout.step.main')} · ${amount}`,
      target: target(work),
      explanation: explain(
        work,
        b.repeat > 1 ? t('workout.explain.repeat') : t(`workout.explain.zone${work.zone}`),
      ),
    });
  });
  parts.cooldown.forEach((s, i) =>
    items.push({
      key: `c${i}`,
      title: `${t('workout.step.cooldown')} · ${amountText(t, s)}`,
      target: target(s),
      explanation: explain(s, t('workout.explain.cooldown')),
    }),
  );
  return items;
}

const formatPace = (sec: number) => `${formatDuration(sec)}/km`;

/** What was actually done: "52 min · 10.3 km · ⌀ 142 bpm". */
function actualText(t: TFunction, { activity: a }: LinkedActivity): string {
  return [
    t('workoutText.minutes', { count: Math.round(a.durationSec / 60) }),
    a.distanceM !== null ? t('plan.km', { value: Math.round(a.distanceM / 100) / 10 }) : null,
    a.avgHr !== null ? t('workout.avgHr', { value: Math.round(a.avgHr) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * One workout: header tinted in the type colour, duration as a range, quick actions, outdoor /
 * indoor, numbered steps with target and explanation, "why this session" and one primary action.
 * Easy sessions phrase pace as a limit ("no faster than …") with HR as the real target.
 */
export function WorkoutScreen({ id, startMoving = false, initialSetting }: WorkoutScreenProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { data: stored, isPending } = usePlan();
  const actions = usePlanActions();
  const hasGym = useHasGym();
  const setFeedback = usePlanUiStore((s) => s.setFeedback);
  const showWeek = usePlanUiStore((s) => s.showWeek);
  const [moving, setMoving] = useState(startMoving);
  // Until the user picks, an active weather hint pre-selects the indoor version.
  const [picked, setPicked] = useState<Setting | null>(initialSetting ?? null);
  const [warmupOpen, setWarmupOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linked = useWorkoutActivity(id);
  const today = todayIso();

  // Manual zones from Profile → Training zones included.
  const hrZones = useMemo<readonly HrZone[]>(() => planHrZones(stored?.input), [stored?.input]);
  const weather = useWorkoutWeather(stored ? findWorkout(stored.state.plan, id) : undefined);
  const setting: Setting =
    picked ?? (weather?.hint.actions.includes('indoor') ? 'indoor' : 'outdoor');

  if (isPending) return <Screen />;
  const w = stored ? findWorkout(stored.state.plan, id) : undefined;
  if (!stored || !w) {
    return (
      <Screen>
        <Text>{t('plan.workout.notFound')}</Text>
        <Button variant="secondary" label={t('common.back')} onPress={() => router.back()} />
      </Screen>
    );
  }

  const { state, input } = stored;
  const kind = workoutKind(w);
  const color = typeColor(colors, w);
  const status = statusOf(state, w.id);
  const paused = isPaused(state, w.date);
  const outline = !inDetailWindow(w.date, today);
  const km = workoutKm(w, input.profile);
  const date = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    formatDate(iso, i18n.language, opts);
  const title = calendarTitle(t, w);
  const session = workoutTitle(t, w);
  const week = state.plan.weeks.find((x) => x.workouts.some((o) => o.id === w.id));
  const indoor = indoorVersion(w);
  const useIndoor = setting === 'indoor' && indoor !== null;
  const parts = useIndoor ? indoor : w;
  const limit = paceLimitSecPerKm(w, input.profile);
  // The treadmill shows speed, not pace.
  const paceLimit =
    limit === null
      ? null
      : !useIndoor
        ? formatPace(limit)
        : indoor?.kind === 'treadmill'
          ? t('workout.speedLimit', { speed: treadmillSpeedKmh(limit) })
          : null;
  const steps = w.sport === 'strength' ? [] : stepItems(t, parts, hrZones, paceLimit);

  const range = planRange(state.plan);
  const monday = mondayOf(w.date);
  const moveDays = [
    ...weekDates(addDays(monday, -7)),
    ...weekDates(monday),
    ...weekDates(addDays(monday, 7)),
  ].filter((d) => d !== w.date && d >= range.first && d <= range.last);

  const run = (result: { ok: boolean; issues?: Parameters<typeof issueText>[1] }) => {
    setError(result.ok ? null : issueText(t, result.issues ?? []));
    return result.ok;
  };

  const markDone = () => {
    if (run(actions.setStatus(w.id, 'done'))) sessionDoneHaptic();
  };

  const moveTo = (to: string) => {
    const result = actions.move(w.id, to);
    if (!result.ok) return run(result);
    const { warnings, suggestion } = result.value;
    setFeedback(
      warnings.length > 0 || suggestion
        ? { workoutId: w.id, toDate: to, warnings, suggestion }
        : null,
    );
    showWeek(mondayOf(to));
    router.back();
  };

  // Routes exist for runs and rides only (terrain intelligence).
  const routable = w.sport === 'run' || w.sport === 'bike';
  const quickActions: { icon: IconName; label: string; onPress: () => void; active?: boolean }[] = [
    ...(routable
      ? [
          {
            icon: 'route' as const,
            label: t('workout.actions.route'),
            onPress: () => router.push(`/training/route/${encodeURIComponent(w.id)}`),
            active: w.routeId !== undefined,
          },
        ]
      : []),
    // Strength stays in the app (no watch takes it); everything else can go to a watch.
    ...(w.sport !== 'strength' && w.sport !== 'walk'
      ? [
          {
            icon: 'watch' as const,
            label: t('watch.send.action'),
            onPress: () => router.push(`/watch/send/${encodeURIComponent(w.id)}`),
          },
        ]
      : []),
    {
      icon: 'link',
      label: t('workout.actions.link'),
      onPress: () => router.push('/coming-soon/linkActivity'),
    },
    {
      icon: 'warmup',
      label: t('workout.actions.warmup'),
      onPress: () => setWarmupOpen((open) => !open),
      active: warmupOpen,
    },
    {
      icon: status === 'skipped' ? 'undo' : 'skip',
      label: status === 'skipped' ? t('plan.workout.undo') : t('workout.actions.skip'),
      onPress: () => run(actions.setStatus(w.id, status === 'skipped' ? 'planned' : 'skipped')),
    },
  ];

  return (
    <Screen>
      <View style={[styles.header, { borderColor: color }]} testID="workout-header">
        <View style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity: 0.16 }]} />
        <View style={[styles.headerBar, { backgroundColor: color }]} />
        <View style={styles.headerRow}>
          <IconBadge name={kindIcon(kind)} color={color} size={48} />
          <View style={styles.flex}>
            <Text variant="caption" tone="secondary">
              {[
                week
                  ? t('plan.weekOf', { week: week.index + 1, total: state.plan.weeks.length })
                  : null,
                date(w.date, { weekday: 'long', day: 'numeric', month: 'long' }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Text variant="subtitle" accessibilityRole="header">
              {title}
            </Text>
            <Text tone="secondary">
              {[typeName(t, w.type), session !== title ? session : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>
        <View style={styles.headerFigures}>
          <Text variant="title" testID="duration-range">
            {durationText(t, w)}
          </Text>
          {km !== null ? <Text variant="label">{`≈ ${t('plan.km', { value: km })}`}</Text> : null}
        </View>
        <View style={styles.inline}>
          <Icon name="watch" size={14} color={colors.textMuted} />
          <Text variant="caption" tone="secondary">
            {t('workout.watchNever')}
          </Text>
        </View>
        {linked ? (
          <View style={styles.inline} testID="activity-synced">
            <Icon name="connections" size={14} color={colors.textMuted} />
            <Text variant="caption" tone="secondary" style={styles.flex}>
              {t('workout.synced', {
                source: t(`activities.source.${linked.activity.source}`),
                time: new Date(linked.syncedAt).toLocaleString(i18n.language, {
                  weekday: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                actual: actualText(t, linked),
              })}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.badges}>
        {w.hard ? <Badge label={t('plan.hard')} /> : null}
        {status !== 'planned' ? <Badge label={t(`plan.status.${status}`)} /> : null}
        {paused ? <Badge label={t('plan.paused')} /> : null}
        {w.level !== null && !outline ? (
          <Badge label={t('plan.workout.level', { level: w.level })} />
        ) : null}
      </View>

      <View style={styles.quick} testID="quick-actions">
        {quickActions.map((a) => (
          <Pressable
            key={a.icon}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            accessibilityState={a.active === undefined ? undefined : { expanded: a.active }}
            onPress={a.onPress}
            style={({ pressed }) => [
              styles.quickItem,
              { backgroundColor: pressed || a.active ? colors.surface2 : colors.surface },
            ]}
          >
            <Icon name={a.icon} size={22} color={colors.text} />
            <Text variant="micro" style={styles.center}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {warmupOpen ? (
        <Section icon="warmup" color={color} title={t('workout.warmupTitle')}>
          <Text>
            {t(w.sport === 'strength' ? 'workout.warmupStrength' : 'workout.warmupEndurance')}
          </Text>
        </Section>
      ) : null}

      {routable && !useIndoor ? (
        <WorkoutRoute workout={w} profile={input.profile} hrZones={hrZones} color={color} />
      ) : null}
      {linked ? (
        <WorkoutEvaluation
          workout={w}
          activity={linked.activity}
          profile={input.profile}
          hrZones={hrZones}
        />
      ) : null}

      {weather && !outline ? (
        <WeatherHintCard
          workout={w}
          weather={weather}
          onIndoor={useIndoor ? undefined : () => setPicked('indoor')}
          onMove={moveTo}
          onPickDay={() => setMoving(true)}
          onSkip={() => run(actions.setStatus(w.id, 'skipped'))}
        />
      ) : null}

      {indoor && !outline ? (
        <View style={styles.gapSm} testID="indoor-toggle">
          <SegmentedControl
            options={[
              { value: 'outdoor', label: t('workout.outdoor') },
              { value: 'indoor', label: t(`workout.indoor.${indoor.kind}`) },
            ]}
            value={setting}
            onChange={setPicked}
          />
          {useIndoor ? (
            <>
              <Text variant="caption" tone="secondary">
                {indoor.inclinePct !== null
                  ? t('workout.indoorIncline', { incline: indoor.inclinePct })
                  : indoor.durationMin < w.durationMin
                    ? t('workout.indoorShorter', { minutes: indoor.durationMin })
                    : t('workout.indoorSameLoad')}
              </Text>
              {indoor.notes.map((note) => (
                <Text key={note.key} variant="caption" tone="secondary">
                  {`ⓘ ${t(note.key as never, { ...note.params }) as string}`}
                </Text>
              ))}
            </>
          ) : null}
        </View>
      ) : null}

      {outline ? (
        <Section icon="info" color={color} title={t('plan.workout.outlineTitle')}>
          <Text tone="secondary">{t('plan.outlineHint')}</Text>
        </Section>
      ) : (
        <>
          {w.paceMode === 'limit' && w.sport !== 'strength' ? (
            <Card testID="hr-first">
              <View style={styles.inline}>
                <Icon name="heart" size={18} color={colors.text} />
                <Text style={[styles.flex, styles.strong]}>
                  {paceLimit
                    ? t('workout.limitHint', { pace: paceLimit })
                    : t('workout.limitHintNoPace')}
                </Text>
              </View>
            </Card>
          ) : null}
          <Section
            icon="structure"
            color={color}
            title={w.sport === 'strength' ? t('plan.workout.exercises') : t('workout.steps')}
          >
            {w.sport === 'strength'
              ? exerciseLines(t, w).map((line, i) => (
                  <NumberedRow key={i} n={i + 1} color={color} title={line} />
                ))
              : steps.map((s, i) => (
                  <NumberedRow
                    key={`${setting}-${s.key}`}
                    n={i + 1}
                    color={color}
                    title={s.title}
                    target={s.target}
                    explanation={s.explanation}
                  />
                ))}
          </Section>
          <Section icon="why" color={color} title={t('plan.workout.why')}>
            <Text>{t(w.whyKey as never) as string}</Text>
            {w.notes.map((note, i) => (
              <Text key={`${note.key}-${i}`} variant="caption" tone="secondary">
                {`ⓘ ${t(note.key as never, { ...note.params }) as string}`}
              </Text>
            ))}
          </Section>
        </>
      )}

      <LinkRow
        icon="book"
        title={t('workoutTypes.whatIs', { name: title })}
        hint={t(`workoutTypes.kinds.${kindKey(kind)}.short` as never) as string}
        onPress={() => router.push(`/training/workout-types?focus=${kindKey(kind)}`)}
      />

      {error ? <Text style={{ color: colors.errorText }}>{error}</Text> : null}

      <View style={styles.actions}>
        {status !== 'done' && w.sport === 'strength' && hasGym ? (
          // Planned strength opens into a Gym session, pre-filled with the prescribed exercises.
          <Button
            icon="strength"
            label={t('plan.workout.startInGym')}
            onPress={() => {
              useActiveWorkoutStore.getState().setWorkout(w);
              router.push({ pathname: '/gym/session', params: { workoutId: w.id } });
            }}
          />
        ) : null}
        {status !== 'done' && w.sport === 'strength' && !hasGym ? (
          // Without the Gym add-on the session can be read and marked done with duration and effort.
          <Button
            icon="check"
            label={t('gymAddon.doneOnly.title')}
            onPress={() => router.push({ pathname: '/gym/quick-log', params: { workoutId: w.id } })}
          />
        ) : null}
        {status !== 'done' && !(w.sport === 'strength' && !hasGym) ? (
          <Button
            icon="check"
            variant={w.sport === 'strength' ? 'secondary' : 'primary'}
            label={t('plan.workout.markDone')}
            onPress={markDone}
          />
        ) : status !== 'done' ? null : (
          <Button
            icon="undo"
            variant="secondary"
            label={t('plan.workout.undo')}
            onPress={() => run(actions.setStatus(w.id, 'planned'))}
          />
        )}
        {!moving ? (
          <Button
            icon="move"
            variant="secondary"
            label={t('plan.workout.move')}
            onPress={() => setMoving(true)}
          />
        ) : null}
      </View>

      {moving ? (
        <ChipGroup
          label={t('plan.workout.moveTo')}
          options={moveDays.map((d) => ({
            value: d,
            label: date(d, { weekday: 'short', day: 'numeric', month: 'short' }),
          }))}
          selected={[]}
          onToggle={moveTo}
        />
      ) : null}
    </Screen>
  );
}

interface NumberedRowProps {
  n: number;
  color: string;
  title: string;
  target?: string;
  explanation?: string;
}

function NumberedRow({ n, color, title, target, explanation }: NumberedRowProps) {
  return (
    <View style={styles.step} accessible testID={`step-${n}`}>
      <View style={[styles.stepNumber, { borderColor: color }]}>
        <Text variant="label">{n}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.strong}>{title}</Text>
        {target ? <Text>{target}</Text> : null}
        {explanation ? (
          <Text variant="caption" tone="secondary">
            {explanation}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

interface SectionProps {
  icon: IconName;
  title: string;
  /** Icon colour (the workout's type colour). */
  color: string;
  children: ReactNode;
}

function Section({ icon, title, color, children }: SectionProps) {
  return (
    <Card>
      <View style={styles.inline}>
        <Icon name={icon} size={18} color={color} />
        <Text variant="label">{title}</Text>
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    borderRadius: radius.md,
    overflow: 'hidden',
    padding: spacing.md,
    paddingTop: spacing.md + 4,
    gap: spacing.sm,
  },
  headerBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerFigures: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  flex: { flex: 1 },
  strong: { fontWeight: '600' },
  center: { textAlign: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quick: { flexDirection: 'row', gap: spacing.sm },
  quickItem: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  gapSm: { gap: spacing.sm },
  step: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  stepNumber: {
    minWidth: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { gap: spacing.sm },
});
