import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { numeric, spacing, useTheme } from '../theme';
import { Text } from './text';

export interface ProgressRingProps {
  /** 0…1 */
  share: number;
  label: string;
  /** Shown in the middle ("1,240"). */
  value: string;
  /** Under the label ("of 2,100 kcal"). */
  caption: string;
  size?: number;
  testID?: string;
}

/** A ring against a target (diary: kcal and macros). The numbers are always written out too. */
export function ProgressRing({
  share,
  label,
  value,
  caption,
  size = 72,
  testID,
}: ProgressRingProps) {
  const { colors } = useTheme();
  const stroke = size / 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = Math.min(1, Math.max(0, share));
  return (
    <View
      style={styles.root}
      testID={testID}
      accessible
      accessibilityLabel={`${label}: ${value} ${caption}`}
    >
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.surface2}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.accentLine}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${c * filled} ${c}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text variant="caption" style={numeric}>
            {value}
          </Text>
        </View>
      </View>
      <Text variant="caption" style={styles.label}>
        {label}
      </Text>
      <Text variant="caption" tone="secondary" style={numeric}>
        {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: spacing.xs, flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '600' },
});
