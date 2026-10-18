import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme, zoneColorKey } from '../theme';
import { Text } from './text';

export interface ZoneRow {
  zone: 1 | 2 | 3 | 4 | 5;
  label: string;
  name: string;
  range: string;
  highlighted?: boolean;
}

export interface ZoneTableProps {
  rows: readonly ZoneRow[];
}

/** Training zones with a colour bar per zone; labels are text-coloured so they never rely on colour alone. */
export function ZoneTable({ rows }: ZoneTableProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.table, { borderColor: colors.border }]} accessibilityRole="list">
      {rows.map((row, index) => {
        const zoneColor = colors[zoneColorKey(row.zone)];
        return (
          <View
            key={row.zone}
            accessible
            accessibilityLabel={`${row.label} ${row.name}: ${row.range}`}
            style={[
              styles.row,
              index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
              row.highlighted && { backgroundColor: colors.surface2 },
            ]}
          >
            <View style={[styles.bar, { backgroundColor: zoneColor }]} />
            <View style={styles.name}>
              <Text variant="caption" tone="secondary" style={styles.zoneLabel}>
                {row.label}
              </Text>
              <Text>{row.name}</Text>
            </View>
            <Text style={styles.range}>{row.range}</Text>
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
