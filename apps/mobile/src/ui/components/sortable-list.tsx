import { useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  type PanGestureActiveEvent,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { spacing, useTheme } from '../theme';

export interface SortableListProps<T> {
  items: readonly T[];
  keyOf: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /** Called once when an item is dropped at a new index. */
  onMove: (from: number, to: number) => void;
  /** Screen-reader actions, e.g. "Move up" / "Move down" (the drag itself is not accessible). */
  moveUpLabel: string;
  moveDownLabel: string;
  testID?: string;
}

/**
 * A vertical list whose rows can be reordered by dragging the grip on the right. Screen-reader
 * users reorder with the "move up / move down" actions on each row.
 */
export function SortableList<T>({
  items,
  keyOf,
  renderItem,
  onMove,
  moveUpLabel,
  moveDownLabel,
  testID,
}: SortableListProps<T>) {
  // Row heights by index, for turning the drag distance into a target index.
  const heights = useRef<number[]>([]);
  const targetIndex = (from: number, dy: number): number => {
    const h = heights.current;
    let to = from;
    let rest = dy;
    while (rest > 0 && to < items.length - 1) {
      const next = h[to + 1] ?? 56;
      if (rest < next / 2) break;
      rest -= next;
      to++;
    }
    while (rest < 0 && to > 0) {
      const prev = h[to - 1] ?? 56;
      if (-rest < prev / 2) break;
      rest += prev;
      to--;
    }
    return to;
  };
  const drop = (from: number, dy: number) => {
    const to = targetIndex(from, dy);
    if (to !== from) onMove(from, to);
  };

  return (
    <View style={styles.list} testID={testID}>
      {items.map((item, index) => (
        <SortableRow
          key={keyOf(item)}
          testID={testID ? `${testID}-row-${index}` : undefined}
          onLayoutHeight={(h) => {
            heights.current[index] = h;
          }}
          onDrop={(dy) => drop(index, dy)}
          canMoveUp={index > 0}
          canMoveDown={index < items.length - 1}
          onMoveUp={() => onMove(index, index - 1)}
          onMoveDown={() => onMove(index, index + 1)}
          moveUpLabel={moveUpLabel}
          moveDownLabel={moveDownLabel}
        >
          {renderItem(item, index)}
        </SortableRow>
      ))}
    </View>
  );
}

function SortableRow({
  children,
  testID,
  onLayoutHeight,
  onDrop,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  moveUpLabel,
  moveDownLabel,
}: {
  children: ReactNode;
  testID?: string;
  onLayoutHeight: (h: number) => void;
  onDrop: (dy: number) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  moveUpLabel: string;
  moveDownLabel: string;
}) {
  const y = useSharedValue(0);
  const lifted = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const settle = (to: number) => {
    'worklet';
    return reduceMotion ? to : withSpring(to);
  };
  const pan = usePanGesture({
    minDistance: 2,
    onActivate: () => {
      'worklet';
      lifted.value = settle(1);
    },
    onUpdate: (e: PanGestureActiveEvent) => {
      'worklet';
      y.value = e.translationY;
    },
    onDeactivate: (e: PanGestureActiveEvent & { canceled: boolean }) => {
      'worklet';
      if (!e.canceled) scheduleOnRN(onDrop, e.translationY);
    },
    onFinalize: () => {
      'worklet';
      // The list re-renders in the new order; the row snaps into its new place.
      y.value = 0;
      lifted.value = settle(0);
    },
  });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { scale: 1 + lifted.value * 0.02 }],
    zIndex: lifted.value > 0 ? 10 : 0,
    elevation: lifted.value * 8,
  }));

  const actions = [
    ...(canMoveUp ? [{ name: 'moveUp', label: moveUpLabel }] : []),
    ...(canMoveDown ? [{ name: 'moveDown', label: moveDownLabel }] : []),
  ];

  return (
    <Animated.View
      style={[styles.row, style]}
      testID={testID}
      onLayout={(e) => onLayoutHeight(e.nativeEvent.layout.height)}
      accessibilityActions={actions}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'moveUp') onMoveUp();
        if (e.nativeEvent.actionName === 'moveDown') onMoveDown();
      }}
    >
      <View style={styles.flex}>{children}</View>
      <GestureDetector gesture={pan}>
        <View
          testID={testID ? `${testID}-handle` : undefined}
          style={styles.handle}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Grip />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

/** Six dots – the drag handle (same as the calendar's). */
function Grip() {
  const { colors } = useTheme();
  return (
    <View style={styles.grip}>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={[styles.dot, { backgroundColor: colors.textMuted }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
  handle: { width: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  grip: { width: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  dot: { width: 4, height: 4, borderRadius: 2 },
});
