import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { FoodItem } from '@/data/repositories/body-repository';
import { Badge, numeric, spacing, Text, useTheme } from '@/ui';

import { isRecipe, summaryOf } from '../recipes';

/** One food in a list: name, brand, energy per 100 g / ml (or another line, e.g. per portion). */
export function FoodRow({
  name,
  brand,
  kcal,
  basis,
  onPress,
  testID,
  badge,
  detail,
}: {
  name: string;
  brand: string | null;
  kcal: number;
  basis: 'g' | 'ml';
  onPress: () => void;
  testID?: string;
  badge?: string;
  /** Replaces "… kcal / 100 g" (recipes: per portion). */
  detail?: string;
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
      {badge ? <Badge label={badge} /> : null}
      <Text tone="secondary" style={numeric}>
        {detail ?? t('bodyAddon.food.per100', { kcal: Math.round(kcal), basis })}
      </Text>
    </Pressable>
  );
}

/** A stored food or recipe as a row: recipes with their badge and kcal per portion. */
export function FoodItemRow({
  item,
  onPress,
  testID,
}: {
  item: FoodItem;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTranslation();
  const s = isRecipe(item) ? summaryOf(item.recipe) : null;
  return (
    <FoodRow
      name={item.name}
      brand={item.brand}
      kcal={item.kcal}
      basis={item.basis}
      onPress={onPress}
      testID={testID ?? `food-row-${item.id}`}
      badge={isRecipe(item) ? t('bodyAddon.recipes.badge') : undefined}
      detail={s ? t('bodyAddon.recipes.perPortionShort', { kcal: s.perPortion.kcal }) : undefined}
    />
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
