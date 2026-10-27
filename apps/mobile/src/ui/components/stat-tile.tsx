import type { ChangeTone } from '@peakr/theme';
import { Children, createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { numeric, radius, spacing, useTheme, type ThemeColors } from '../theme';
import { Text } from './text';

export type { ChangeTone } from '@peakr/theme';

export interface StatTileProps {
  value: string;
  label: string;
  /**
   * One line of context under the value ("▼ 0.6 kg · last 7 days"). With `tone` it is drawn in
   * the change colour; the arrow or sign in the text carries the meaning, never the colour alone.
   */
  context?: string;
  tone?: ChangeTone;
  testID?: string;
}

const TONE_COLOR: Record<ChangeTone, keyof ThemeColors> = {
  favourable: 'changeFavourable',
  unfavourable: 'changeUnfavourable',
  neutral: 'changeNeutral',
};

/** Below this width, or with a font scale above this, a tile grid has one column. */
const NARROW_DP = 360;
const LARGE_FONT = 1.3;

const ColumnsContext = createContext<1 | 2 | null>(null);

/**
 * A figure with its label: the label small in capitals, the value large, one line of context.
 * Text wraps instead of being cut off; inside a `TileGrid` the tile takes its column.
 */
export function StatTile({ value, label, context, tone, testID }: StatTileProps) {
  const { colors } = useTheme();
  const columns = useContext(ColumnsContext);
  const a11y = context ? `${label}: ${value}, ${context}` : `${label}: ${value}`;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={a11y}
      style={[styles.tile, columns === 1 ? styles.full : null, { backgroundColor: colors.surface }]}
    >
      <Text variant="micro" tone="secondary" style={styles.label}>
        {label}
      </Text>
      <Text variant="heading" style={numeric}>
        {value}
      </Text>
      {context ? (
        <Text
          variant="caption"
          style={[
            numeric,
            tone ? { color: colors[TONE_COLOR[tone]] } : { color: colors.textMuted },
          ]}
        >
          {context}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Tiles in a wrapping two-column grid; one column on narrow screens and with large fonts, so
 * nothing runs off the edge (CLAUDE.md "UI patterns → Body").
 */
export function TileGrid({ children, testID }: { children: ReactNode; testID?: string }) {
  const { width, fontScale } = useWindowDimensions();
  const columns: 1 | 2 = width < NARROW_DP || fontScale > LARGE_FONT ? 1 : 2;
  return (
    <ColumnsContext.Provider value={columns}>
      <View style={styles.grid} testID={testID}>
        {Children.toArray(children)}
      </View>
    </ColumnsContext.Provider>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: '40%',
    minWidth: 0,
    borderRadius: radius.md,
    padding: spacing.sm + spacing.xs,
    gap: 2,
  },
  full: { flexBasis: '100%' },
  label: { letterSpacing: 0.6, fontWeight: '600', textTransform: 'uppercase' },
});
