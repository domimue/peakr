import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme, zoneColorKey } from '../theme';
import { Badge } from './badge';
import { Text } from './text';

export interface ZoneRow {
  zone: 1 | 2 | 3 | 4 | 5;
  label: string;
  name: string;
  range: string;
  highlighted?: boolean;
  /** The range was set manually instead of calculated. */
  custom?: boolean;
}

export interface ZoneTableProps {
  rows: readonly ZoneRow[];
  /** Label of the badge on custom rows, e.g. "Custom". */
  customLabel?: string;
  /** Makes rows tappable, e.g. to edit a zone. */
  onPressRow?: (zone: ZoneRow['zone']) => void;
  /** Accessibility hint for tappable rows. */
  rowHint?: string;
}

/** Training zones with a colour bar per zone; labels are text-coloured so they never rely on colour alone. */
export function ZoneTable({ rows, customLabel, onPressRow, rowHint }: ZoneTableProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.table, { borderColor: colors.border }]} accessibilityRole="list">
      {rows.map((row, index) => {
        const zoneColor = colors[zoneColorKey(row.zone)];
        const custom = row.custom && customLabel ? customLabel : undefined;
        const content = (
          <>
            <View style={[styles.bar, { backgroundColor: zoneColor }]} />
            <View style={styles.name}>
              <Text variant="caption" tone="secondary" style={styles.zoneLabel}>
                {row.label}
              </Text>
              <Text>{row.name}</Text>
            </View>
            {custom ? <Badge label={custom} /> : null}
            <Text style={styles.range}>{row.range}</Text>
          </>
        );
        const rowStyle = [
          styles.row,
          index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
          row.highlighted && { backgroundColor: colors.surface2 },
        ];
        const label = [`${row.label} ${row.name}: ${row.range}`, custom].filter(Boolean).join(', ');
        return onPressRow ? (
          <Pressable
            key={row.zone}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={rowHint}
            onPress={() => onPressRow(row.zone)}
            style={({ pressed }) => [...rowStyle, pressed && { backgroundColor: colors.surface2 }]}
          >
            {content}
          </Pressable>
        ) : (
          <View key={row.zone} accessible accessibilityLabel={label} style={rowStyle}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingRight: spacing.md,
    gap: spacing.md,
    minHeight: 56,
  },
  bar: { width: 6, alignSelf: 'stretch' },
  name: { flex: 1 },
  zoneLabel: { fontWeight: '700' },
  range: { fontVariant: ['tabular-nums'], fontWeight: '500' },
});
