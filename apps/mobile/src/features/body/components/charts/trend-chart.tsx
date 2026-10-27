import type { ForecastPoint, TrendPoint } from '@peakr/engine';
import { DashPathEffect, Line as SkiaLine, vec } from '@shopify/react-native-skia';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { CartesianChart, Line, Scatter } from 'victory-native';

import { daysBetween } from '@/data/ids';
import { spacing, Text, useTheme } from '@/ui';

const HEIGHT = 200;

/**
 * Weight over time: daily weigh-ins as dots, the trend line, the goal as a dashed line and the
 * forecast at the chosen rate and at the real pace. Colours from the theme; each series is named
 * in the legend, and the figures are given in text around the chart.
 */
export function TrendChart({
  trend,
  targetKg,
  planned,
  real,
  accessibilityLabel,
}: {
  trend: readonly TrendPoint[];
  targetKg: number | null;
  planned: readonly ForecastPoint[];
  real: readonly ForecastPoint[];
  accessibilityLabel: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const start = trend[0]?.date;
  if (!start) return null;
  type Row = {
    x: number;
    weight: number | null;
    trend: number | null;
    planned: number | null;
    real: number | null;
  };
  const rows = new Map<number, Row>();
  const row = (date: string) => {
    const x = daysBetween(start, date);
    const r = rows.get(x) ?? { x, weight: null, trend: null, planned: null, real: null };
    rows.set(x, r);
    return r;
  };
  for (const p of trend) Object.assign(row(p.date), { weight: p.weightKg, trend: p.trendKg });
  for (const p of planned) row(p.date).planned = p.kg;
  for (const p of real) row(p.date).real = p.kg;
  const data = [...rows.values()].sort((a, b) => a.x - b.x);
  const values = data
    .flatMap((r) => [r.weight, r.trend, r.planned, r.real])
    .concat(targetKg)
    .filter((v): v is number => v !== null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.1, 0.5);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={styles.chart} testID="body-trend-chart">
        <CartesianChart
          data={data}
          xKey="x"
          yKeys={['weight', 'trend', 'planned', 'real']}
          domain={{ y: [min - pad, max + pad] }}
          domainPadding={{ left: 8, right: 8 }}
        >
          {({ points, chartBounds, yScale }) => (
            <>
              {targetKg !== null ? (
                <SkiaLine
                  p1={vec(chartBounds.left, yScale(targetKg))}
                  p2={vec(chartBounds.right, yScale(targetKg))}
                  color={colors.chartTarget}
                  strokeWidth={1.5}
                >
                  <DashPathEffect intervals={[4, 4]} />
                </SkiaLine>
              ) : null}
              <Scatter points={points.weight} radius={2.5} color={colors.textMuted} />
              <Line
                points={points.trend}
                color={colors.chartTrend}
                strokeWidth={2}
                connectMissingData
              />
              <Line
                points={points.planned}
                color={colors.accentLine}
                strokeWidth={1.5}
                connectMissingData
              />
              <Line points={points.real} color={colors.info} strokeWidth={1.5} connectMissingData />
            </>
          )}
        </CartesianChart>
      </View>
      <View style={styles.legend}>
        <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
        <Text variant="caption" tone="secondary">
          {t('bodyAddon.dashboard.chart.weighIns')}
        </Text>
        <View style={[styles.line, { backgroundColor: colors.chartTrend }]} />
        <Text variant="caption" tone="secondary">
          {t('bodyAddon.dashboard.chart.trend')}
        </Text>
        {targetKg !== null ? (
          <>
            <View style={[styles.dash, { borderColor: colors.chartTarget }]} />
            <Text variant="caption" tone="secondary">
              {t('bodyAddon.dashboard.chart.goal')}
            </Text>
          </>
        ) : null}
        {planned.length > 0 ? (
          <>
            <View style={[styles.line, { backgroundColor: colors.accentLine }]} />
            <Text variant="caption" tone="secondary">
              {t('bodyAddon.dashboard.chart.planned')}
            </Text>
          </>
        ) : null}
        {real.length > 0 ? (
          <>
            <View style={[styles.line, { backgroundColor: colors.info }]} />
            <Text variant="caption" tone="secondary">
              {t('bodyAddon.dashboard.chart.real')}
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
  dot: { width: 6, height: 6, borderRadius: 3 },
  line: { width: 16, height: 2 },
  dash: { width: 16, borderTopWidth: 1, borderStyle: 'dashed' },
});
