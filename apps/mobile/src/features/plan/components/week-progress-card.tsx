import {
  statusOf,
  typeColorKey,
  weekProgress,
  WORKOUT_TYPES,
  type PlanState,
  type PlanWeek,
  type UserProfile,
  type WeekTag,
} from '@peakr/engine';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Badge, Button, Icon, radius, SegmentedProgress, spacing, Text, useTheme } from '@/ui';
import { useSettingsStore } from '@/features/settings/settings-store';
import { distanceUnit, KM_PER_MILE } from '@/features/settings/units';

import { addDays, formatDate, weekDates } from '../calendar';
import { typeColor, typeName } from '../kind';
import { WorkoutCard } from './workout-card';

export interface WeekProgressCardProps {
  week: PlanWeek;
  state: PlanState;
  profile: UserProfile;
  totalWeeks: number;
  tags: readonly WeekTag[];
  /** Plan tab: date range, "Week 3 of 12", tags and the type summary; Today: only the progress. */
  header: boolean;
  isCurrent?: boolean;
  /** Plan tab: the card opens and closes; open it lists every day with its sessions. */
  expanded?: boolean;
  onToggle?: () => void;
  today?: string;
  onOpenWorkout?: (id: string) => void;
  onOpenCalendar?: () => void;
}

/**
 * A week at a glance: one segment per session in its type colour, the types named in text
 * ("2× Easy · Long · Strength"), sessions and km done / planned, a tick when every session is done
 * or skipped. In the Plan tab the card expands to the sessions of each day.
 */
export function WeekProgressCard({
  week,
  state,
  profile,
  totalWeeks,
  tags,
  header,
  isCurrent,
  expanded = false,
  onToggle,
  today,
  onOpenWorkout,
  onOpenCalendar,
}: WeekProgressCardProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const units = useSettingsStore((s) => s.units);
  const p = weekProgress(state, week, profile);
  const date = (iso: string) => formatDate(iso, i18n.language, { day: 'numeric', month: 'short' });
  const range = `${date(week.startDate)} – ${date(addDays(week.startDate, 6))}`;
  const weekLabel = t('plan.weekOf', { week: week.index + 1, total: totalWeeks });
  const sessions = t('plan.progress.sessions', {
    done: p.sessionsDone,
    planned: p.sessionsPlanned,
  });
  const toUnit = (km: number) => Math.round(units === 'imperial' ? km / KM_PER_MILE : km);
  const distance = t('plan.progress.distance', {
    done: toUnit(p.kmDone),
    planned: toUnit(p.kmPlanned),
    unit: distanceUnit(units),
  });
  const segments = p.segments.map((s) => ({
    key: s.workoutId,
    color: typeColor(colors, s),
    state: s.status,
  }));
  // Types in the order of the colour scale, each with its count – the legend of the bar.
  const types = WORKOUT_TYPES.map((type) => ({
    type,
    count: p.segments.filter((s) => s.type === type).length,
    colorKey: typeColorKey(type),
  })).filter((x) => x.count > 0);
  const typeSummary = types
    .map((x) => (x.count > 1 ? `${x.count}× ${typeName(t, x.type)}` : typeName(t, x.type)))
    .join(' · ');

  const progress = (
    <>
      <SegmentedProgress
        testID={`week-progress-${week.index}`}
        segments={segments}
        accessibilityLabel={`${sessions}, ${distance}`}
      />
      <View style={styles.figures}>
        <Text variant="caption">{sessions}</Text>
        {p.kmPlanned > 0 ? <Text variant="caption">{distance}</Text> : null}
      </View>
    </>
  );

  if (!header) {
    return (
      <View
        style={[styles.card, { backgroundColor: colors.surface }]}
        testID={`week-card-${week.index}`}
      >
        {progress}
      </View>
    );
  }

  const label = [
    range,
    weekLabel,
    typeSummary,
    sessions,
    distance,
    p.complete ? t('plan.weekComplete') : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Animated.View
      layout={LinearTransition.duration(200)}
      style={[styles.card, { backgroundColor: colors.surface }]}
      testID={`week-card-${week.index}`}
    >
      <Pressable
        testID={`week-toggle-${week.index}`}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded }}
        accessibilityHint={t(expanded ? 'plan.collapseHint' : 'plan.expandHint')}
        onPress={onToggle}
        style={styles.gap}
      >
        <View style={styles.head}>
          <View style={styles.flex}>
            <Text variant="label">{range}</Text>
            <Text variant="caption" tone="secondary">
              {`${weekLabel} · ${t(`plan.phases.${week.phase}`)}`}
            </Text>
          </View>
          {isCurrent ? <Badge label={t('plan.thisWeek')} /> : null}
          {p.complete ? (
            <View accessible accessibilityLabel={t('plan.weekComplete')}>
              <Icon name="check" size={24} color={colors.accentLine} />
            </View>
          ) : null}
          <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={20} color={colors.textMuted} />
        </View>
        {tags.length > 0 ? (
          <View style={styles.tags}>
            {tags.map((tag) => (
              <Badge key={tag} label={t(`plan.tags.${tag}`)} />
            ))}
          </View>
        ) : null}
        {types.length > 0 ? (
          <View style={styles.types} testID={`week-types-${week.index}`}>
            {types.map((x) => (
              <View key={x.type} style={styles.type}>
                <View style={[styles.dot, { backgroundColor: typeColor(colors, x) }]} />
                <Text variant="caption">
                  {x.count > 1 ? `${x.count}× ${typeName(t, x.type)}` : typeName(t, x.type)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {progress}
      </Pressable>

      {expanded ? (
        <Animated.View entering={FadeIn.duration(150)} style={styles.days}>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {weekDates(week.startDate).map((day) => {
            const workouts = week.workouts.filter((w) => w.date === day);
            const isToday = day === today;
            return (
              <View key={day} style={styles.day} testID={`week-${week.index}-day-${day}`}>
                <View style={styles.dayLabel}>
                  <Text
                    variant="caption"
                    tone={isToday ? undefined : 'secondary'}
                    style={isToday && { color: colors.accentLine }}
                  >
                    {formatDate(day, i18n.language, { weekday: 'short' })}
                  </Text>
                  <Text variant="label" style={isToday && { color: colors.accentLine }}>
                    {formatDate(day, i18n.language, { day: 'numeric' })}
                  </Text>
                </View>
                <View style={styles.flex}>
                  {workouts.length === 0 ? (
                    <Text variant="caption" tone="secondary" style={styles.rest}>
                      {t('plan.rest')}
                    </Text>
                  ) : (
                    workouts.map((w) => (
                      <WorkoutCard
                        key={w.id}
                        compact
                        workout={w}
                        status={statusOf(state, w.id)}
                        profile={profile}
                        outline
                        onPress={() => onOpenWorkout?.(w.id)}
                      />
                    ))
                  )}
                </View>
              </View>
            );
          })}
          {onOpenCalendar ? (
            <Button
              small
              variant="secondary"
              icon="calendar"
              label={t('plan.openInCalendar')}
              onPress={onOpenCalendar}
            />
          ) : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  gap: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  types: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xs },
  type: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 10, height: 10, borderRadius: 5 },
  figures: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.xs },
  days: { gap: spacing.sm },
  day: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayLabel: { width: 40, alignItems: 'center' },
  rest: { paddingVertical: spacing.xs },
});
