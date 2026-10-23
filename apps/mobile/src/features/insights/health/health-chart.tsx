import { Circle } from '@shopify/react-native-skia';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AreaRange, CartesianChart, Line, Scatter } from 'victory-native';

import { spacing, Text, useTheme } from '@/ui';

export interface ChartDay {
  day: string;
  value: number | null;
  /** Baseline band of that day (from the days before it); null without enough history. */
  low: number | null;
  high: number | null;
}

export interface ChartMarker {
  day: string;
  /** Workout type colour token value (the type is named in the list below the chart). */
  color: string;
}

export interface HealthChartProps {
  days: readonly ChartDay[];
  markers?: readonly ChartMarker[];
  accessibilityLabel: string;
}

const HEIGHT = 180;

/**
 * One metric over a period: the values as a line with points, the user's own baseline band behind
 * it, and optional dots under the chart for hard sessions. victory-native / Skia; colours from
 * the theme; every figure is also given in text (the value list and the legend).
 */
export function HealthChart({ days, markers = [], accessibilityLabel }: HealthChartProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const data = days.map((d, i) => ({ x: i, value: d.value, low: d.low, high: d.high }));
  const all = days.flatMap((d) => [d.value, d.low, d.high]).filter((v): v is number => v !== null);
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  const pad = Math.max((max - min) * 0.15, 1);
  const markerIndex = new Map(days.map((d, i) => [d.day, i]));

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={styles.chart} testID="health-chart">
        <CartesianChart
          data={data}
          xKey="x"
          yKeys={['value', 'low', 'high']}
          domain={{ y: [min - pad, max + pad] }}
          domainPadding={{ left: 8, right: 8 }}
        >
          {({ points, chartBounds, xScale }) => (
            <>
              {/* Days without enough history leave a gap instead of a made-up band. */}
              <AreaRange
                upperPoints={points.high}
                lowerPoints={points.low}
                color={colors.surface2}
              />
              <Line points={points.value} color={colors.text} strokeWidth={2} connectMissingData />
              <Scatter
                points={points.value}
                radius={days.length > 60 ? 1.5 : 3}
                color={colors.text}
              />
              {markers.map((m) => {
                const i = markerIndex.get(m.day);
                if (i === undefined) return null;
                return (
                  <Circle
                    key={`${m.day}-${m.color}`}
                    cx={xScale(i)}
                    cy={chartBounds.bottom - 5}
                    r={4}
                    color={m.color}
                  />
                );
              })}
            </>
          )}
        </CartesianChart>
      </View>
      <View style={styles.legend}>
        <View style={[styles.line, { backgroundColor: colors.text }]} />
        <Text variant="caption" tone="secondary">
          {t('health.detail.legendValue')}
        </Text>
        <View
          style={[styles.swatch, { backgroundColor: colors.surface2, borderColor: colors.border }]}
        />
        <Text variant="caption" tone="secondary">
          {t('health.baseline.band')}
        </Text>
        {markers.length > 0 ? (
          <>
            <View style={[styles.dot, { borderColor: colors.textMuted }]} />
            <Text variant="caption" tone="secondary">
              {t('health.detail.legendHard')}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { height: HEIGHT },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  line: { width: 16, height: 2 },
  swatch: { width: 14, height: 10, borderRadius: 2, borderWidth: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 2 },
});
