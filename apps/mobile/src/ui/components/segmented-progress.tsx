import { StyleSheet, View } from 'react-native';

import { radius, useTheme } from '../theme';

export interface ProgressSegmentView {
  key: string;
  /** Type colour of the session. */
  color: string;
  state: 'done' | 'planned' | 'skipped';
}

export interface SegmentedProgressProps {
  segments: readonly ProgressSegmentView[];
  /** Read out instead of the segments, e.g. "2 of 4 sessions done". */
  accessibilityLabel: string;
  height?: number;
  testID?: string;
}

/**
 * One segment per session: done = filled in the type colour, planned = outlined in it, skipped =
 * a faint track. The figures next to it always say the same in text.
 */
export function SegmentedProgress({
  segments,
  accessibilityLabel,
  height = 8,
  testID,
}: SegmentedProgressProps) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={styles.row}
    >
      {segments.length === 0 ? (
        <View style={[styles.segment, { height, backgroundColor: colors.surface2 }]} />
      ) : (
        segments.map((s) => (
          <View
            key={s.key}
            style={[
              styles.segment,
              { height },
              s.state === 'done'
                ? { backgroundColor: s.color }
                : s.state === 'planned'
                  ? { borderColor: s.color, borderWidth: 1.5 }
                  : { backgroundColor: colors.surface2 },
            ]}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, borderRadius: radius.pill },
});
