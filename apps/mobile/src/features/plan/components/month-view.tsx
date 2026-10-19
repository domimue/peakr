import { isPaused, statusOf, type PlanState } from '@peakr/engine';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, Text, useTheme } from '@/ui';

import { formatDate, isSameMonth, monthGrid, mondayOf, sportColor, weekDates } from '../calendar';

export interface MonthViewProps {
  /** First day of the month. */
  month: string;
  today: string;
  state: PlanState;
  /** Opens the week view at that week. */
  onSelectWeek: (monday: string) => void;
}

/** Month grid: one coloured bar per workout (sport colour), today outlined. Tap opens the week. */
export function MonthView({ month, today, state, onSelectWeek }: MonthViewProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const workouts = state.plan.weeks.flatMap((w) => w.workouts);
  const header = weekDates(mondayOf(month));

  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        {header.map((d) => (
          <Text key={d} variant="micro" tone="secondary" style={styles.headerCell}>
            {formatDate(d, i18n.language, { weekday: 'narrow' })}
          </Text>
        ))}
      </View>
      {monthGrid(month).map((week) => (
        <Pressable
          key={week[0]}
          accessibilityRole="button"
          accessibilityLabel={t('plan.month.openWeek', {
            date: formatDate(week[0] ?? month, i18n.language, { day: 'numeric', month: 'long' }),
          })}
          onPress={() => onSelectWeek(week[0] ?? month)}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}
        >
          {week.map((date) => {
            const inMonth = isSameMonth(date, month);
            const day = workouts.filter((w) => w.date === date);
            const isToday = date === today;
            return (
              <View
                key={date}
                testID={`month-day-${date}`}
                style={[
                  styles.cell,
                  { backgroundColor: colors.surface, opacity: inMonth ? 1 : 0.4 },
                  isToday && { borderColor: colors.accentLine, borderWidth: 1.5 },
                ]}
              >
                <Text variant="micro" style={isToday && { color: colors.accentLine }}>
                  {formatDate(date, i18n.language, { day: 'numeric' })}
                </Text>
                {isPaused(state, date) && day.length === 0 ? (
                  <View style={[styles.bar, { backgroundColor: colors.border }]} />
                ) : null}
                {day.map((w) => (
                  <View
                    key={w.id}
                    style={[
                      styles.bar,
                      {
                        backgroundColor: sportColor(colors, w.sport),
                        opacity: statusOf(state, w.id) === 'skipped' ? 0.35 : 1,
                        height: w.hard ? 6 : 3,
                      },
                    ]}
                  />
                ))}
              </View>
            );
          })}
        </Pressable>
      ))}
      <View style={styles.legend}>
        {[...new Set(workouts.map((w) => w.sport))].map((sport) => (
          <View key={sport} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: sportColor(colors, sport) }]} />
            <Text variant="micro">{t(`plan.sports.${sport}`)}</Text>
          </View>
        ))}
      </View>
      <Text variant="caption" tone="secondary">
        {t('plan.month.legend')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.xs, borderRadius: radius.md },
  headerCell: { flex: 1, textAlign: 'center' },
  cell: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.sm,
    padding: spacing.xs,
    gap: 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  bar: { borderRadius: 2, width: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 12, height: 4, borderRadius: 2 },
});
