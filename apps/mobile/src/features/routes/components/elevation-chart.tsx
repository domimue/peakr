import type { ElevationPoint } from '@peakr/engine';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Area, CartesianChart, Line } from 'victory-native';

import { spacing, Text, useTheme } from '@/ui';

export interface ElevationChartProps {
  profile: readonly ElevationPoint[];
  color: string;
  gainM: number;
  lossM: number;
  height?: number;
}

/** At most this many points are drawn (the stored profile has one every 25 m). */
const MAX_POINTS = 200;

/**
 * Elevation profile (victory-native / Skia) with distance in km on the x axis. The figures – gain,
 * loss, lowest and highest point – are always written out as text as well.
 */
export function ElevationChart({
  profile,
  color,
  gainM,
  lossM,
  height = 120,
}: ElevationChartProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const data = useMemo(() => {
    const step = Math.max(1, Math.ceil(profile.length / MAX_POINTS));
    return profile
      .filter((_, i) => i % step === 0 || i === profile.length - 1)
      .map((p) => ({ km: p.distanceM / 1000, m: p.elevationM }));
  }, [profile]);
  const elevations = profile.map((p) => p.elevationM);
  const min = Math.round(Math.min(...elevations));
  const max = Math.round(Math.max(...elevations));
  const km = (profile.at(-1)?.distanceM ?? 0) / 1000;
  const summary = t('routes.elevation.summary', { gain: gainM, loss: lossM, min, max });

  if (data.length < 2) return null;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary}>
      <View style={{ height }} testID="elevation-chart">
        <CartesianChart
          data={data}
          xKey="km"
          yKeys={['m']}
          domain={{
            y: [min - Math.max(10, (max - min) * 0.1), max + Math.max(10, (max - min) * 0.1)],
          }}
        >
          {({ points, chartBounds }) => (
            <>
              <Area points={points.m} y0={chartBounds.bottom} color={colors.surface2} />
              <Line points={points.m} color={color} strokeWidth={2} />
            </>
          )}
        </CartesianChart>
      </View>
      <View style={styles.axis}>
        <Text variant="micro" tone="secondary">
          {t('plan.km', { value: 0 })}
        </Text>
        <Text variant="micro" tone="secondary">
          {t('plan.km', { value: Math.round(km * 10) / 10 })}
        </Text>
      </View>
      <Text variant="caption" tone="secondary">
        {summary}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
});
