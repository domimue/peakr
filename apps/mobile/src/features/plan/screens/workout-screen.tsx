import {
  calculateHrZones,
  findWorkout,
  inDetailWindow,
  isPaused,
  kindKey,
  planRange,
  statusOf,
  workoutKind,
  type HrZone,
} from '@peakr/engine';
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import {
  Badge,
  Button,
  Card,
  ChipGroup,
  Icon,
  IconBadge,
  LinkRow,
  numeric,
  Screen,
  spacing,
  Text,
  useTheme,
  type IconName,
} from '@/ui';

import {
  exerciseLines,
  structureLines,
  targetText,
  workoutTitle,
} from '../../onboarding/workout-text';
import { addDays, formatDate, mondayOf, weekDates } from '../calendar';
import { workoutKm } from '../components/workout-card';
import { calendarTitle, kindColor, kindIcon } from '../kind';
import { usePlanUiStore } from '../plan-ui-store';
import { usePlan, usePlanActions } from '../queries';
import { issueText } from './plan-screen';

export interface WorkoutScreenProps {
  id: string;
  /** Opened via "move" (accessibility action): the day picker is shown right away. */
  startMoving?: boolean;
}

/**
 * One workout: its general kind ("Tempo run") with the concrete session behind it, structured
 * steps with zone targets, "why this session" and a link to the workout-type explanation. Every
 * action is allowed (done, skip, move to any day); the plan tab shows warnings afterwards.
 * Beyond the 4-week look-ahead only the outline is shown.
 */
export function WorkoutScreen({ id, startMoving = false }: WorkoutScreenProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { data: stored, isPending } = usePlan();
  const actions = usePlanActions();
  const setFeedback = usePlanUiStore((s) => s.setFeedback);
  const showWeek = usePlanUiStore((s) => s.showWeek);
  const [moving, setMoving] = useState(startMoving);
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();

  const hrZones = useMemo<readonly HrZone[]>(() => {
    const input = stored?.input.hrZones;
    if (!input) return [];
    const zones = calculateHrZones(input);
    return zones.ok ? zones.value.zones : [];
  }, [stored?.input.hrZones]);

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
  const color = kindColor(colors, kind);
  const status = statusOf(state, w.id);
  const paused = isPaused(state, w.date);
  const outline = !inDetailWindow(w.date, today);
  const km = workoutKm(w, input.profile);
  const date = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    formatDate(iso, i18n.language, opts);
  const lines = w.sport === 'strength' ? exerciseLines(t, w) : structureLines(t, w);
  const title = calendarTitle(t, w);
  const session = workoutTitle(t, w);

  const range = planRange(state.plan);
  const monday = mondayOf(w.date);
  const moveDays = [
    ...weekDates(addDays(monday, -7)),
    ...weekDates(monday),
    ...weekDates(addDays(monday, 7)),
  ].filter((d) => d !== w.date && d >= range.first && d <= range.last);

  const run = (result: { ok: boolean; issues?: Parameters<typeof issueText>[1] }) => {
    setError(result.ok ? null : issueText(t, result.issues ?? []));
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

  return (
    <Screen>
      <View style={styles.hero}>
        <IconBadge name={kindIcon(kind)} color={color} size={56} />
        <View style={styles.flex}>
          <Text variant="caption" tone="secondary">
            {date(w.date, { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <Text variant="subtitle" accessibilityRole="header">
            {title}
          </Text>
          {session !== title ? <Text tone="secondary">{session}</Text> : null}
        </View>
      </View>

      <Card style={styles.stats}>
        <Stat icon="time" value={t('workoutText.minutes', { count: w.durationMin })} />
        {km !== null ? <Stat icon="distance" value={t('plan.km', { value: km })} /> : null}
        {!outline && w.sport !== 'strength' ? (
          <Stat icon="heart" value={targetText(t, w.target, hrZones)} />
        ) : null}
      </Card>

      <View style={styles.badges}>
        {w.hard ? <Badge label={t('plan.hard')} /> : null}
        {status !== 'planned' ? <Badge label={t(`plan.status.${status}`)} /> : null}
        {paused ? <Badge label={t('plan.paused')} /> : null}
        {w.level !== null && !outline ? (
          <Badge label={t('plan.workout.level', { level: w.level })} />
        ) : null}
      </View>

      {outline ? (
        <Section icon="info" color={color} title={t('plan.workout.outlineTitle')}>
          <Text tone="secondary">{t('plan.outlineHint')}</Text>
        </Section>
      ) : (
        <>
          <Section
            icon="structure"
            color={color}
            title={
              w.sport === 'strength' ? t('plan.workout.exercises') : t('plan.workout.structure')
            }
          >
            <View style={[styles.lines, { borderLeftColor: color }]}>
              {lines.map((line, i) => (
                <Text key={i}>{line}</Text>
              ))}
            </View>
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
        {status !== 'done' ? (
          <Button
            icon="check"
            label={t('plan.workout.markDone')}
            onPress={() => run(actions.setStatus(w.id, 'done'))}
          />
        ) : null}
        {status === 'planned' ? (
          <Button
            icon="skip"
            variant="secondary"
            label={t('plan.workout.skip')}
            onPress={() => run(actions.setStatus(w.id, 'skipped'))}
          />
        ) : (
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

function Stat({ icon, value }: { icon: IconName; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={18} color={colors.textMuted} />
      <Text variant="label" style={[numeric, styles.flexShrink]}>
        {value}
      </Text>
    </View>
  );
}

interface SectionProps {
  icon: IconName;
  title: string;
  /** Icon colour (the workout's sport colour). */
  color: string;
  children: ReactNode;
}

function Section({ icon, title, color, children }: SectionProps) {
  return (
    <Card>
      <View style={styles.sectionTitle}>
        <Icon name={icon} size={18} color={color} />
        <Text variant="label">{title}</Text>
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lines: { borderLeftWidth: 2, paddingLeft: spacing.sm, gap: spacing.xs },
  actions: { gap: spacing.sm },
});
