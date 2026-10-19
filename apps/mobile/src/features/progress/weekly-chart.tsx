import { DashPathEffect, Line as SkiaLine, vec } from '@shopify/react-native-skia';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Bar, CartesianChart } from 'victory-native';

import { spacing, Text, useTheme } from '@/ui';

export interface WeeklyBar {
  /** Monday of the week. */
  weekStart: string;
  /** Short label under the bar ("W3"). */
  label: string;
  minutes: number;
}

export interface WeeklyChartProps {
  bars: readonly WeeklyBar[];
  averageMinutes: number;
  /** Read out instead of the drawing. */
  accessibilityLabel: string;
}

const HEIGHT = 160;

/**
 * Minutes per week as bars with the average as a dashed line (victory-native / Skia). Colours come
 * from the theme; the figures are always given in text as well.
 */
export function WeeklyChart({ bars, averageMinutes, accessibilityLabel }: WeeklyChartProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const data = bars.map((b, i) => ({ x: i, minutes: b.minutes }));
  const max = Math.max(averageMinutes, ...bars.map((b) => b.minutes), 30);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={styles.chart} testID="weekly-chart">
        <CartesianChart
          data={data}
          xKey="x"
          yKeys={['minutes']}
          domain={{ y: [0, max * 1.1] }}
          domainPadding={{ left: 16, right: 16 }}
        >
          {({ points, chartBounds, yScale }) => (
            <>
              <Bar
                points={points.minutes}
                chartBounds={chartBounds}
                color={colors.textMuted}
                roundedCorners={{ topLeft: 4, topRight: 4 }}
                innerPadding={0.35}
                {...(reduceMotion ? {} : { animate: { type: 'timing', duration: 300 } })}
              />
              {averageMinutes > 0 ? (
                <SkiaLine
                  p1={vec(chartBounds.left, yScale(averageMinutes))}
                  p2={vec(chartBounds.right, yScale(averageMinutes))}
                  color={colors.accentLine}
                  strokeWidth={1.5}
                >
                  <DashPathEffect intervals={[6, 4]} />
                </SkiaLine>
              ) : null}
            </>
          )}
        </CartesianChart>
      </View>
      <View style={styles.labels}>
        {bars.map((b) => (
          <Text key={b.weekStart} variant="micro" tone="secondary" style={styles.label}>
            {b.label}
          </Text>
        ))}
      </View>
      <View style={styles.legend}>
        <View style={[styles.swatch, { backgroundColor: colors.textMuted }]} />
        <Text variant="caption" tone="secondary">
          {t('progress.chart.minutes')}
        </Text>
        <View style={[styles.dash, { borderColor: colors.accentLine }]} />
        <Text variant="caption" tone="secondary">
          {t('progress.chart.average', { value: averageMinutes })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { height: HEIGHT },
  labels: { flexDirection: 'row', paddingHorizontal: spacing.md },
  label: { flex: 1, textAlign: 'center' },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  dash: { width: 16, borderTopWidth: 1.5, borderStyle: 'dashed' },
});
