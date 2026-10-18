import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { radius, useTheme } from '../theme';

export interface ProgressBarProps {
  /** 0 … 1 */
  progress: number;
  accessibilityLabel: string;
}

/** Thin bar that animates to the new progress (quiz steps). */
export function ProgressBar({ progress, accessibilityLabel }: ProgressBarProps) {
  const { colors } = useTheme();
  const value = useSharedValue(progress);

  useEffect(() => {
    value.value = withTiming(Math.min(1, Math.max(0, progress)), { duration: 300 });
  }, [progress, value]);

  const fill = useAnimatedStyle(() => ({ width: `${value.value * 100}%` }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      style={[styles.track, { backgroundColor: colors.surface2 }]}
    >
      <Animated.View style={[styles.fill, { backgroundColor: colors.accentLine }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: radius.pill, overflow: 'hidden', flex: 1 },
  fill: { height: '100%', borderRadius: radius.pill },
});
