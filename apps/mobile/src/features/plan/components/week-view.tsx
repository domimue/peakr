import {
  inDetailWindow,
  isPaused,
  statusOf,
  type PlanState,
  type UserProfile,
  type Workout,
} from '@peakr/engine';
import { useCallback, useMemo, useRef, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  type PanGestureActiveEvent,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { radius, spacing, Text, useTheme } from '@/ui';

import { formatDate, weekDates } from '../calendar';
import { WorkoutCard } from './workout-card';

/** Hold before a card can be dragged (a quick swipe still scrolls the list). */
const LONG_PRESS_MS = 300;

type ViewRef = ComponentRef<typeof View>;

interface RowBounds {
  top: number;
  bottom: number;
}

export interface WeekViewProps {
  monday: string;
  today: string;
  state: PlanState;
  /** For the distance estimates on the cards. */
  profile: UserProfile;
  onOpen: (id: string) => void;
  /** Dropped on another day. */
  onMove: (id: string, toDate: string) => void;
  /** Accessible / non-gesture way to move (opens the workout with its day picker). */
  onMoveAction: (id: string) => void;
  /** Dragging started / ended – the screen locks scrolling meanwhile. */
  onDragChange?: (dragging: boolean) => void;
}

/** The day row under the finger; above or below the list snaps to the first / last day. */
function rowAt(rows: readonly RowBounds[], y: number): number {
  'worklet';
  let best = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    if (y >= r.top && y < r.bottom) return i;
    const distance = Math.min(Math.abs(y - r.top), Math.abs(y - r.bottom));
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Seven day rows. Long-press a workout (or grab its handle) and drag it onto any other day – the
 * calendar is freely plannable; the drop calls `onMove`, the engine only warns and suggests.
 */
export function WeekView({
  monday,
  today,
  state,
  profile,
  onOpen,
  onMove,
  onMoveAction,
  onDragChange,
}: WeekViewProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const dates = weekDates(monday);
  const rowRefs = useRef<(ViewRef | null)[]>([]);
  const rows = useSharedValue<RowBounds[]>([]);
  const hover = useSharedValue(-1);
  /** Row of the dragged card – raised above the other days on the UI thread. */
  const activeRow = useSharedValue(-1);
  const week = state.plan.weeks.find((w) => w.startDate === monday);
  const workouts = useMemo(() => week?.workouts ?? [], [week]);

  const measureRows = useCallback(() => {
    const bounds: RowBounds[] = [];
    let pending = rowRefs.current.length;
    rowRefs.current.forEach((ref, i) => {
      if (!ref) {
        pending--;
        return;
      }
      ref.measureInWindow((_x, y, _w, h) => {
        bounds[i] = { top: y, bottom: y + h };
        if (--pending === 0) rows.value = bounds;
      });
    });
  }, [rows]);

  const dragStart = useCallback(() => {
    onDragChange?.(true);
    measureRows();
  }, [measureRows, onDragChange]);
  const dragEnd = useCallback(
    (id: string, row: number) => {
      onDragChange?.(false);
      const to = row >= 0 ? dates[row] : undefined;
      const from = workouts.find((w) => w.id === id)?.date;
      if (to && to !== from) onMove(id, to);
    },
    [dates, onDragChange, onMove, workouts],
  );

  return (
    <View style={styles.week}>
      {dates.map((date, i) => {
        const dayWorkouts = workouts.filter((w) => w.date === date);
        const paused = isPaused(state, date);
        const isToday = date === today;
        return (
          <DayRow
            key={date}
            index={i}
            hover={hover}
            activeRow={activeRow}
            ref={(r) => {
              rowRefs.current[i] = r;
            }}
            testID={`plan-day-${i}`}
          >
            <View
              style={[
                styles.dayLabel,
                isToday && { borderColor: colors.accentLine, borderWidth: 1.5 },
              ]}
              accessibilityLabel={`${formatDate(date, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}${isToday ? `, ${t('plan.today')}` : ''}`}
            >
              <Text variant="micro" tone="secondary">
                {formatDate(date, i18n.language, { weekday: 'short' })}
              </Text>
              <Text variant="label" style={isToday && { color: colors.accentLine }}>
                {formatDate(date, i18n.language, { day: 'numeric' })}
              </Text>
            </View>
            <View style={styles.dayContent}>
              {dayWorkouts.length === 0 ? (
                <Text variant="caption" tone="secondary" style={styles.rest}>
                  {paused ? t('plan.paused') : t('plan.rest')}
                </Text>
              ) : (
                dayWorkouts.map((w, n) => (
                  <DraggableWorkout
                    key={w.id}
                    testID={`plan-card-${i}-${n}`}
                    workout={w}
                    state={state}
                    today={today}
                    profile={profile}
                    rows={rows}
                    hover={hover}
                    row={i}
                    activeRow={activeRow}
                    onOpen={onOpen}
                    onMoveAction={onMoveAction}
                    onDragStart={dragStart}
                    onDragEnd={dragEnd}
                  />
                ))
              )}
            </View>
          </DayRow>
        );
      })}
    </View>
  );
}

interface DayRowProps {
  index: number;
  hover: SharedValue<number>;
  activeRow: SharedValue<number>;
  testID: string;
  ref: (r: ViewRef | null) => void;
  children: React.ReactNode;
}

/** A day; highlighted while a dragged workout hovers over it. */
function DayRow({ index, hover, activeRow, testID, ref, children }: DayRowProps) {
  const { colors } = useTheme();
  const highlight = useAnimatedStyle(() => ({
    borderColor: hover.value === index ? colors.accentLine : 'transparent',
    zIndex: activeRow.value === index ? 10 : 0,
    elevation: activeRow.value === index ? 10 : 0,
  }));
  return (
    <Animated.View ref={ref} testID={testID} collapsable={false} style={[styles.day, highlight]}>
      {children}
    </Animated.View>
  );
}

interface DraggableWorkoutProps {
  testID: string;
  workout: Workout;
  state: PlanState;
  today: string;
  profile: UserProfile;
  rows: SharedValue<RowBounds[]>;
  hover: SharedValue<number>;
  row: number;
  activeRow: SharedValue<number>;
  onOpen: (id: string) => void;
  onMoveAction: (id: string) => void;
  onDragStart: () => void;
  onDragEnd: (id: string, row: number) => void;
}

function DraggableWorkout({
  testID,
  workout: w,
  state,
  today,
  profile,
  rows,
  hover,
  row,
  activeRow,
  onOpen,
  onMoveAction,
  onDragStart,
  onDragEnd,
}: DraggableWorkoutProps) {
  const status = statusOf(state, w.id);
  const paused = isPaused(state, w.date);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const lifted = useSharedValue(0);

  const onActivate = () => {
    'worklet';
    lifted.value = withSpring(1);
    activeRow.set(row);
    scheduleOnRN(onDragStart);
  };
  const onUpdate = (e: PanGestureActiveEvent) => {
    'worklet';
    x.value = e.translationX;
    y.value = e.translationY;
    hover.set(rowAt(rows.get(), e.absoluteY));
  };
  const onDeactivate = (e: PanGestureActiveEvent & { canceled: boolean }) => {
    'worklet';
    const row = e.canceled ? -1 : rowAt(rows.get(), e.absoluteY);
    scheduleOnRN(onDragEnd, w.id, row);
  };
  const onFinalize = () => {
    'worklet';
    hover.set(-1);
    activeRow.set(-1);
    lifted.value = withSpring(0);
    x.value = withSpring(0);
    y.value = withSpring(0);
  };
  // Long-press anywhere on the card, or drag the handle right away.
  const cardPan = usePanGesture({
    activateAfterLongPress: LONG_PRESS_MS,
    onActivate,
    onUpdate,
    onDeactivate,
    onFinalize,
  });
  const handlePan = usePanGesture({
    minDistance: 2,
    onActivate,
    onUpdate,
    onDeactivate,
    onFinalize,
  });

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: 1 + lifted.value * 0.03 },
    ],
    zIndex: lifted.value > 0 ? 10 : 0,
    elevation: lifted.value * 8,
  }));

  return (
    <GestureDetector gesture={cardPan}>
      <Animated.View style={[styles.draggable, style]} testID={testID}>
        <View style={styles.flex}>
          <WorkoutCard
            workout={w}
            status={status}
            outline={!inDetailWindow(w.date, today)}
            paused={paused}
            profile={profile}
            onPress={() => onOpen(w.id)}
            onMoveAction={() => onMoveAction(w.id)}
          />
        </View>
        <GestureDetector gesture={handlePan}>
          <View
            testID={`${testID}-handle`}
            style={styles.handle}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Grip />
          </View>
        </GestureDetector>
      </Animated.View>
    </GestureDetector>
  );
}

/** Six dots – the drag handle. */
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
  draggable: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.xs },
  flex: { flex: 1 },
  handle: { width: 28, alignItems: 'center', justifyContent: 'center' },
  grip: { width: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  week: { gap: spacing.xs },
  day: {
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 60,
    padding: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  dayLabel: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
  },
  dayContent: { flex: 1, gap: spacing.xs, justifyContent: 'center' },
  rest: { paddingVertical: spacing.sm },
});
