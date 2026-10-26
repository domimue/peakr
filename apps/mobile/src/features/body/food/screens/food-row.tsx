import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { numeric, spacing, Text, useTheme } from '@/ui';

/** One food in a list: name, brand, energy per 100 g / ml. */
export function FoodRow({
  name,
  brand,
  kcal,
  basis,
  onPress,
  testID,
}: {
  name: string;
  brand: string | null;
  kcal: number;
  basis: 'g' | 'ml';
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        { borderColor: colors.border },
        pressed && { backgroundColor: colors.surface2 },
      ]}
    >
      <View style={styles.flex}>
        <Text>{name}</Text>
        {brand ? (
          <Text variant="caption" tone="secondary">
            {brand}
          </Text>
        ) : null}
      </View>
      <Text tone="secondary" style={numeric}>
        {t('bodyAddon.food.per100', { kcal: Math.round(kcal), basis })}
      </Text>
    </Pressable>
  );
}

/** Open Food Facts attribution (ODbL), shown wherever its data appears. */
export function OffAttribution() {
  const { t } = useTranslation();
  return (
    <Text variant="caption" tone="secondary" testID="off-attribution">
      {t('bodyAddon.food.attribution')}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
});
