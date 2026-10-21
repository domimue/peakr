import { useReducedMotion } from 'react-native-reanimated';
import { StyleSheet, View } from 'react-native';
import { Bar, CartesianChart, Line } from 'victory-native';

import { spacing, Text, useTheme } from '@/ui';

/**
 * Small charts of the gym screens (victory-native / Skia, like the Progress chart). Colours come
 * from the theme; every chart is an image for screen readers with the figures in its label, and the
 * screens list the numbers in text as well.
 */

const HEIGHT = 140;

export interface ChartBar {
  key: string;
  label: string;
  value: number;
}

export function GymBarChart({
  bars,
  accessibilityLabel,
  testID,
}: {
  bars: readonly ChartBar[];
  accessibilityLabel: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const data = bars.map((b, i) => ({ x: i, value: b.value }));
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={styles.chart} testID={testID}>
        <CartesianChart
          data={data}
          xKey="x"
          yKeys={['value']}
          domain={{ y: [0, max * 1.1] }}
          domainPadding={{ left: 16, right: 16 }}
        >
          {({ points, chartBounds }) => (
            <Bar
              points={points.value}
              chartBounds={chartBounds}
              color={colors.typeStrength}
              roundedCorners={{ topLeft: 4, topRight: 4 }}
              innerPadding={0.35}
              {...(reduceMotion ? {} : { animate: { type: 'timing', duration: 300 } })}
            />
          )}
        </CartesianChart>
      </View>
      <View style={styles.labels}>
        {bars.map((b) => (
          <Text key={b.key} variant="micro" tone="secondary" style={styles.label}>
            {b.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

export interface ChartSeries {
  /** One value per point; null = no value at that point (the line skips it). */
  values: (number | null)[];
  color: string;
  label: string;
}

/** Up to two lines over the same points (e.g. estimated 1RM and heaviest set). */
export function GymLineChart({
  series,
  labels,
  accessibilityLabel,
  testID,
}: {
  series: readonly [ChartSeries, ChartSeries?];
  labels: readonly string[];
  accessibilityLabel: string;
  testID?: string;
}) {
  const [a, b] = series;
  const data = labels.map((_, i) => ({ x: i, a: a.values[i] ?? null, b: b?.values[i] ?? null }));
  const all = [...a.values, ...(b?.values ?? [])].filter((v): v is number => v !== null);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = Math.max(2.5, (max - min) * 0.1);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={styles.chart} testID={testID}>
        <CartesianChart
          data={data}
          xKey="x"
          yKeys={['a', 'b']}
          domain={{ y: [Math.max(0, min - pad), max + pad] }}
          domainPadding={{ left: 12, right: 12 }}
        >
          {({ points }) => (
            <>
              <Line points={points.a} color={a.color} strokeWidth={2} connectMissingData />
              {b ? (
                <Line points={points.b} color={b.color} strokeWidth={2} connectMissingData />
              ) : null}
            </>
          )}
        </CartesianChart>
      </View>
      <View style={styles.legend}>
        {[a, b].flatMap((s) =>
          s
            ? [
                <View key={s.label} style={styles.legendItem}>
                  <View style={[styles.swatch, { backgroundColor: s.color }]} />
                  <Text variant="caption" tone="secondary">
                    {s.label}
                  </Text>
                </View>,
              ]
            : [],
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { height: HEIGHT },
  labels: { flexDirection: 'row', paddingHorizontal: spacing.md },
  label: { flex: 1, textAlign: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 10, height: 10, borderRadius: 2 },
});
