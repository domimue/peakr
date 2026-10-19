import { type PlanState } from '@peakr/engine';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, Text, useTheme } from '@/ui';

import { formatDate, weekDates } from '../calendar';
import { typeColor, typeName } from '../kind';

export interface WeekStripProps {
  monday: string;
  today: string;
  state: PlanState;
  onSelectDay?: (date: string) => void;
}

/** Mon–Sun with today marked and one dot in the type colour per session of the day. */
export function WeekStrip({ monday, today, state, onSelectDay }: WeekStripProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const week = state.plan.weeks.find((w) => w.startDate === monday);
  return (
    <View style={styles.row} testID="week-strip">
      {weekDates(monday).map((date) => {
        const sessions = (week?.workouts ?? []).filter((w) => w.date === date);
        const isToday = date === today;
        const label = [
          formatDate(date, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }),
          isToday ? t('plan.today') : null,
          sessions.length === 0
            ? t('plan.rest')
            : sessions.map((w) => typeName(t, w.type)).join(', '),
        ]
          .filter(Boolean)
          .join(', ');
        return (
          <Pressable
            key={date}
            testID={`strip-${date}`}
            accessibilityRole={onSelectDay ? 'button' : undefined}
            accessibilityLabel={label}
            accessibilityState={isToday ? { selected: true } : undefined}
            disabled={!onSelectDay}
            onPress={() => onSelectDay?.(date)}
            style={[
              styles.day,
              isToday && { backgroundColor: colors.surface2, borderColor: colors.accentLine },
            ]}
          >
            <Text variant="micro" tone="secondary">
              {formatDate(date, i18n.language, { weekday: 'narrow' })}
            </Text>
            <Text variant="label" style={isToday && { color: colors.accentLine }}>
              {formatDate(date, i18n.language, { day: 'numeric' })}
            </Text>
            <View style={styles.dots}>
              {sessions.slice(0, 3).map((w) => (
                <View key={w.id} style={[styles.dot, { backgroundColor: typeColor(colors, w) }]} />
              ))}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  dots: { flexDirection: 'row', gap: 3, minHeight: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
