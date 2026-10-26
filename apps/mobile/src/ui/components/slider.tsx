import { useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { radius, spacing, useTheme } from '../theme';
import { Text } from './text';

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  testID?: string;
}

const snap = (v: number, min: number, max: number, step: number) =>
  Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));

/**
 * Horizontal slider in steps (weekly rate). Drag or tap the track; screen readers adjust it with
 * the increment / decrement actions, one step at a time.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = String,
  testID,
}: SliderProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const range = max - min || 1;
  const ratio = Math.min(1, Math.max(0, (value - min) / range));

  const move = (x: number) => {
    if (width <= 0) return;
    const raw = min + (Math.min(width, Math.max(0, x)) / width) * (max - min);
    onChange(Math.round(snap(raw, min, max, step) * 100) / 100);
  };

  const shift = (dir: 1 | -1) =>
    onChange(Math.round(snap(value + dir * step, min, max, step) * 100) / 100);

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text variant="caption" style={styles.label}>
          {label}
        </Text>
        <Text style={styles.value}>{format(value)}</Text>
      </View>
      <View
        testID={testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: format(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => shift(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={styles.touch}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e: GestureResponderEvent) => move(e.nativeEvent.locationX)}
        onResponderMove={(e: GestureResponderEvent) => move(e.nativeEvent.locationX)}
      >
        <View style={[styles.track, { backgroundColor: colors.surface2 }]}>
          <View
            style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: colors.accentLine }]}
          />
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            { left: `${ratio * 100}%`, backgroundColor: colors.text, borderColor: colors.bg },
          ]}
        />
      </View>
    </View>
  );
}

const THUMB = 24;

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontWeight: '600' },
  value: { fontVariant: ['tabular-nums'], fontWeight: '500' },
  touch: { height: 44, justifyContent: 'center' },
  track: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%' },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    marginLeft: -THUMB / 2,
    borderRadius: THUMB / 2,
    borderWidth: 2,
  },
});
