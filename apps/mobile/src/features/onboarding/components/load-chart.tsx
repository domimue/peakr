import type { Phase } from '@peakr/engine';
import type { ForecastWeek, PhaseSegment } from '@peakr/quiz';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { radius, spacing, Text, useTheme, type ThemeColors } from '@/ui';

const CHART_HEIGHT = 140;

/** Phase → colour, reusing the zone scale (base easy … peak hard, taper light). */
export function phaseColor(colors: ThemeColors, phase: Phase): string {
  switch (phase) {
    case 'base':
    case 'maintain':
      return colors.zone2;
    case 'build':
      return colors.zone3;
    case 'peak':
      return colors.zone4;
    case 'taper':
      return colors.zone1;
  }
}

/** Weekly load as bars that grow in one after another; recovery weeks are lighter. */
export function LoadChart({ weeks, maxLoad }: { weeks: readonly ForecastWeek[]; maxLoad: number }) {
  const { t } = useTranslation();
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  return (
    <View
      accessible
      accessibilityLabel={t('quiz.forecast.chartLabel', {
        weeks: weeks.length,
        from: Math.round(first?.load ?? 0),
        max: Math.round(maxLoad),
      })}
    >
      <View style={styles.chart}>
        {weeks.map((w, i) => (
          <Bar key={w.index} week={w} share={maxLoad > 0 ? w.load / maxLoad : 0} delay={i * 35} />
        ))}
      </View>
      <View style={styles.axis}>
        <Text variant="caption" tone="secondary">
          {t('quiz.forecast.weekShort', { week: 1 })}
        </Text>
        {last ? (
          <Text variant="caption" tone="secondary">
            {t('quiz.forecast.weekShort', { week: last.index + 1 })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Bar({ week, share, delay }: { week: ForecastWeek; share: number; delay: number }) {
  const { colors } = useTheme();
  const height = useSharedValue(0);

  useEffect(() => {
    height.value = withDelay(
      delay,
      withTiming(Math.max(2, share * CHART_HEIGHT), { duration: 450 }),
    );
  }, [delay, height, share]);

  const style = useAnimatedStyle(() => ({ height: height.value }));
  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: phaseColor(colors, week.phase), opacity: week.isRecovery ? 0.45 : 1 },
        style,
      ]}
    />
  );
}

/** Weeks per phase in order of appearance (open goals repeat base/build blocks). */
function weeksPerPhase(phases: readonly PhaseSegment[]): Map<Phase, number> {
  const out = new Map<Phase, number>();
  for (const p of phases) out.set(p.phase, (out.get(p.phase) ?? 0) + p.weeks);
  return out;
}

/** Phases as one proportional strip with labels below. */
export function PhaseStrip({ phases, weeks }: { phases: readonly PhaseSegment[]; weeks: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.phases}>
      <View style={styles.strip}>
        {phases.map((p) => (
          <View
            key={p.startWeek}
            style={{ flex: p.weeks / weeks, backgroundColor: phaseColor(colors, p.phase) }}
          />
        ))}
      </View>
      <View style={styles.legend}>
        {[...weeksPerPhase(phases)].map(([phase, count]) => (
          <Text key={phase} variant="caption" tone="secondary">
            {t('quiz.forecast.phaseWeeks', { phase: t(`quiz.forecast.phases.${phase}`), count })}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    height: CHART_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  bar: { flex: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  phases: { gap: spacing.xs },
  strip: {
    flexDirection: 'row',
    height: 10,
    borderRadius: radius.pill,
    overflow: 'hidden',
    gap: 2,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: 2 },
});
