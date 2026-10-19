import {
  workoutKind,
  workoutKm as engineWorkoutKm,
  type UserProfile,
  type Workout,
  type WorkoutStatus,
} from '@peakr/engine';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import { Icon, IconBadge, radius, spacing, Text, useTheme, zoneColorKey } from '@/ui';

import { durationText } from '../../onboarding/workout-text';
import { calendarTitle, kindIcon, typeColor, typeName } from '../kind';

export interface WorkoutCardProps {
  workout: Workout;
  status: WorkoutStatus;
  /** For the distance estimate. */
  profile: UserProfile;
  /** Beyond the 4-week look-ahead: name, duration and distance only. */
  outline: boolean;
  /** Inside a pause: shown dimmed. */
  paused?: boolean;
  /** Calendar chip: one line, no zone pills. */
  compact?: boolean;
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

/** Total estimated km of a workout (all disciplines), or null without distance (strength). */
export function workoutKm(w: Workout, profile: UserProfile): number | null {
  const km = engineWorkoutKm(w, profile);
  return km > 0 ? km : null;
}

/**
 * A planned workout: a bar in the type colour on the left edge, the general name ("Easy run"),
 * the type in words, the duration range, distance, main zone and a hard marker. Type and zone are
 * always written out, never only colour-coded.
 */
export function WorkoutCard({
  workout: w,
  status,
  profile,
  outline,
  paused,
  compact,
  onPress,
  onMoveAction,
}: WorkoutCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const kind = workoutKind(w);
  const color = typeColor(colors, w);
  const zone = w.sport === 'strength' ? null : mainZone(w);
  const title = calendarTitle(t, w);
  const type = typeName(t, w.type);
  const km = workoutKm(w, profile);
  const minutes = durationText(t, w);
  const meta = km === null ? minutes : `${minutes} · ${t('plan.km', { value: km })}`;
  const statusLabel = status === 'planned' ? null : t(`plan.status.${status}`);
  const dim = status === 'skipped' || paused;

  const label = [
    title,
    type,
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

  const statusIcon =
    status === 'done' ? (
      <Icon name="check" size={18} color={colors.accentLine} />
    ) : status === 'skipped' ? (
      <Icon name="skip" size={18} color={colors.textMuted} />
    ) : null;

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
        compact && styles.compact,
        { backgroundColor: pressed ? colors.surface2 : colors.surface, opacity: dim ? 0.55 : 1 },
      ]}
    >
      <View style={[styles.bar, { backgroundColor: color }]} testID={`type-bar-${w.colorKey}`} />
      {compact ? null : <IconBadge name={kindIcon(kind)} color={color} />}
      <View style={styles.body}>
        <View style={styles.row}>
          <Text
            numberOfLines={compact ? 1 : 2}
            style={[styles.title, status === 'skipped' && styles.skipped]}
          >
            {title}
          </Text>
          {statusIcon}
        </View>
        <View style={styles.row}>
          <Text variant="caption" tone="secondary" style={styles.flex}>
            {compact ? meta : `${type} · ${meta}`}
          </Text>
          {!compact && !outline && zone !== null ? (
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
    paddingLeft: spacing.sm + spacing.xs + 4,
    paddingRight: spacing.sm + spacing.xs,
    overflow: 'hidden',
  },
  compact: { paddingVertical: spacing.xs + 2, gap: spacing.sm },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  body: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  flex: { flexGrow: 1, flexShrink: 1 },
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
