import type { WeekEnergyBar } from '@peakr/engine';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { CartesianChart, Line, Scatter, StackedBar } from 'victory-native';

import { spacing, Text, useTheme } from '@/ui';

const HEIGHT = 180;

/**
 * Energy per week (average per logged day): resting and active stacked, intake as a line with
 * points – each series in its theme chart colour and named in the legend. The balance and the
 * fat estimate of each week are listed in text below.
 */
export function EnergyBarsChart({
  bars,
  labels,
  accessibilityLabel,
}: {
  bars: readonly WeekEnergyBar[];
  labels: readonly string[];
  accessibilityLabel: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const data = bars.map((b, i) => ({
    x: i,
    resting: b.restingKcal,
    active: b.activeKcal,
    intake: b.intakeKcal,
  }));
  const max = Math.max(
    1000,
    ...bars.map((b) => Math.max(b.restingKcal + b.activeKcal, b.intakeKcal ?? 0)),
  );

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={styles.chart} testID="body-energy-chart">
        <CartesianChart
          data={data}
          xKey="x"
          yKeys={['resting', 'active', 'intake']}
          domain={{ y: [0, max * 1.1] }}
          domainPadding={{ left: 16, right: 16 }}
        >
          {({ points, chartBounds }) => (
            <>
              <StackedBar
                points={[points.resting, points.active]}
                chartBounds={chartBounds}
                colors={[colors.chartResting, colors.chartActive]}
                innerPadding={0.35}
                {...(reduceMotion ? {} : { animate: { type: 'timing', duration: 300 } })}
              />
              <Line points={points.intake} color={colors.chartIntake} strokeWidth={2} />
              <Scatter points={points.intake} radius={3} color={colors.chartIntake} />
            </>
          )}
        </CartesianChart>
      </View>
      <View style={styles.labels}>
        {labels.map((l, i) => (
          <Text key={`${l}-${i}`} variant="micro" tone="secondary" style={styles.label}>
            {l}
          </Text>
        ))}
      </View>
      <View style={styles.legend}>
        <View
          style={[
            styles.swatch,
            { backgroundColor: colors.chartResting, borderColor: colors.chartResting },
          ]}
        />
        <Text variant="caption" tone="secondary">
          {t('bodyAddon.dashboard.energy.resting')}
        </Text>
        <View
          style={[
            styles.swatch,
            { backgroundColor: colors.chartActive, borderColor: colors.chartActive },
          ]}
        />
        <Text variant="caption" tone="secondary">
          {t('bodyAddon.dashboard.energy.active')}
        </Text>
        <View style={[styles.line, { backgroundColor: colors.chartIntake }]} />
        <Text variant="caption" tone="secondary">
          {t('bodyAddon.dashboard.energy.intake')}
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
  swatch: { width: 10, height: 10, borderRadius: 2, borderWidth: 1 },
  line: { width: 16, height: 2 },
});
