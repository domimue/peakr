import {
  workoutDistances,
  workoutKind,
  type UserProfile,
  type Workout,
  type WorkoutStatus,
} from '@peakr/engine';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import { Icon, IconBadge, numeric, radius, spacing, Text, useTheme, zoneColorKey } from '@/ui';

import { calendarTitle, kindColor, kindIcon } from '../kind';

export interface WorkoutCardProps {
  workout: Workout;
  status: WorkoutStatus;
  /** For the distance estimate. */
  profile: UserProfile;
  /** Beyond the 4-week look-ahead: name, duration and distance only. */
  outline: boolean;
  /** Inside a pause: shown dimmed. */
  paused?: boolean;
  onPress?: () => void;
  /** Accessible alternative to drag & drop. */
  onMoveAction?: () => void;
}

/** Main-set zone of the workout (the hardest non-rest step), for the intensity marker. */
export function mainZone(w: Workout): 1 | 2 | 3 | 4 | 5 | null {
  const steps = w.main.flatMap((b) => b.steps).filter((s) => !s.rest);
  if (steps.length === 0) return null;
  return steps.reduce((max, s) => (s.zone > max ? s.zone : max), steps[0]?.zone ?? 1);
}

/** Total estimated km of a workout (all disciplines), or null for strength. */
export function workoutKm(w: Workout, profile: UserProfile): number | null {
  const values = Object.values(workoutDistances(w, profile));
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, km) => sum + km, 0) * 10) / 10;
}

/**
 * A planned workout in the calendar: the general name ("Easy run") with its icon in the sport
 * colour, duration, distance, main zone and a hard marker. The details are on the workout screen.
 * Sport and zone are always written out, never only colour-coded.
 */
export function WorkoutCard({
  workout: w,
  status,
  profile,
  outline,
  paused,
  onPress,
  onMoveAction,
}: WorkoutCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const kind = workoutKind(w);
  const zone = w.sport === 'strength' ? null : mainZone(w);
  const title = calendarTitle(t, w);
  const km = workoutKm(w, profile);
  const minutes = t('workoutText.minutes', { count: w.durationMin });
  const meta = km === null ? minutes : `${minutes} · ${t('plan.km', { value: km })}`;
  const statusLabel = status === 'planned' ? null : t(`plan.status.${status}`);
  const dim = status === 'skipped' || paused;

  const label = [
    title,
    t(`plan.sports.${w.sport}`),
    meta,
    !outline && zone !== null ? t('workoutText.hrZone', { zone }) : null,
    w.hard ? t('plan.hard') : null,
    statusLabel,
  ]
    .filter(Boolean)
    .join(', ');

  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'move') onMoveAction?.();
  };

  return (
    <Pressable
      testID={`workout-${w.id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={onMoveAction ? [{ name: 'move', label: t('plan.moveA11y') }] : []}
      onAccessibilityAction={onAccessibilityAction}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? colors.surface2 : colors.surface, opacity: dim ? 0.55 : 1 },
      ]}
    >
      <IconBadge name={kindIcon(kind)} color={kindColor(colors, kind)} />
      <View style={styles.body}>
        <View style={styles.row}>
          <Text numberOfLines={1} style={[styles.title, status === 'skipped' && styles.skipped]}>
            {title}
          </Text>
          {status === 'done' ? <Icon name="check" size={18} color={colors.accentLine} /> : null}
          {status === 'skipped' ? <Icon name="skip" size={18} color={colors.textMuted} /> : null}
        </View>
        <View style={styles.row}>
          <Text variant="caption" tone="secondary" style={[styles.flex, numeric]} numberOfLines={1}>
            {meta}
          </Text>
          {!outline && zone !== null ? (
            <View style={[styles.pill, { borderColor: colors[zoneColorKey(zone)] }]}>
              <View style={[styles.zoneDot, { backgroundColor: colors[zoneColorKey(zone)] }]} />
              <Text variant="micro">{t('plan.zone', { zone })}</Text>
            </View>
          ) : null}
          {w.hard ? (
            <View style={[styles.pill, { borderColor: colors.border }]}>
              <Icon name="bolt" size={12} color={colors.warning} />
              <Text variant="micro">{t('plan.hard')}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + spacing.xs,
  },
  body: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  title: { flex: 1, fontWeight: '600' },
  skipped: { textDecorationLine: 'line-through' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
  },
  zoneDot: { width: 6, height: 6, borderRadius: 3 },
});
