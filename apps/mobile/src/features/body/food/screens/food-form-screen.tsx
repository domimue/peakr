import { isBarcode } from '@peakr/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { FoodItem } from '@/data/repositories/body-repository';
import type { Meal } from '@/features/body/meals';
import { Button, ListState, Screen, SegmentedControl, spacing, Text, TextField } from '@/ui';

import { useFoodItem, useSaveFoodItem } from '../queries';

const parse = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
};
const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

/**
 * An own food, or a correction of an Open Food Facts entry: saved as the user's own food with the
 * same barcode, which then wins over the cache for that barcode. Values per 100 g / ml.
 */
export function FoodFormScreen({
  id,
  barcode,
  meal,
  day,
}: {
  id?: string;
  barcode?: string;
  meal: Meal;
  day: string;
}) {
  const food = useFoodItem(id);
  if (id && food.isPending) return <ListState kind="loading" label="…" />;
  return <Form base={food.data ?? null} barcode={barcode} meal={meal} day={day} />;
}

function Form({
  base,
  barcode,
  meal,
  day,
}: {
  base: FoodItem | null;
  barcode?: string;
  meal: Meal;
  day: string;
}) {
  const { t } = useTranslation();
  const save = useSaveFoodItem();
  const correcting = base?.kind === 'off';
  const [v, setV] = useState({
    name: base?.name ?? '',
    brand: base?.brand ?? '',
    barcode: base?.barcode ?? barcode ?? '',
    basis: base?.basis ?? ('g' as 'g' | 'ml'),
    kcal: str(base?.kcal),
    protein: str(base?.proteinG),
    carbs: str(base?.carbsG),
    fat: str(base?.fatG),
    piece: str(base?.pieceAmount),
    portionLabel: base?.portions[0]?.label ?? '',
    portionAmount: str(base?.portions[0]?.amount),
  });
  const set = (k: keyof typeof v) => (value: string) => setV({ ...v, [k]: value });
  const kcal = parse(v.kcal);
  const macro = (s: string) => parse(s) ?? 0;
  const portion = parse(v.portionAmount);
  const valid =
    v.name.trim().length > 0 &&
    kcal !== null &&
    kcal <= 1000 &&
    [v.protein, v.carbs, v.fat].every((m) => m.trim() === '' || (parse(m) ?? 101) <= 100) &&
    (v.barcode.trim() === '' || isBarcode(v.barcode.trim()));

  return (
    <Screen>
      {correcting ? <Text tone="secondary">{t('bodyAddon.food.correctHint')}</Text> : null}
      <TextField label={t('bodyAddon.food.name')} value={v.name} onChangeText={set('name')} />
      <TextField label={t('bodyAddon.food.brand')} value={v.brand} onChangeText={set('brand')} />
      <TextField
        label={t('bodyAddon.food.barcode')}
        keyboardType="number-pad"
        value={v.barcode}
        onChangeText={set('barcode')}
      />
      <SegmentedControl
        options={[
          { value: 'g', label: t('bodyAddon.food.per100g') },
          { value: 'ml', label: t('bodyAddon.food.per100ml') },
        ]}
        value={v.basis}
        onChange={(b) => setV({ ...v, basis: b })}
      />
      <TextField
        label={t('bodyAddon.diary.kcal')}
        suffix="kcal"
        keyboardType="decimal-pad"
        value={v.kcal}
        onChangeText={set('kcal')}
      />
      <View style={styles.row}>
        {(['protein', 'carbs', 'fat'] as const).map((k) => (
          <View key={k} style={styles.flex}>
            <TextField
              label={t(`bodyAddon.diary.rings.${k}`)}
              suffix="g"
              keyboardType="decimal-pad"
              value={v[k]}
              onChangeText={set(k)}
            />
          </View>
        ))}
      </View>
      <TextField
        label={t('bodyAddon.food.pieceWeight', { basis: v.basis })}
        keyboardType="decimal-pad"
        value={v.piece}
        onChangeText={set('piece')}
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label={t('bodyAddon.food.portionName')}
            value={v.portionLabel}
            onChangeText={set('portionLabel')}
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label={t('bodyAddon.food.portionAmount', { basis: v.basis })}
            keyboardType="decimal-pad"
            value={v.portionAmount}
            onChangeText={set('portionAmount')}
          />
        </View>
      </View>
      <Button
        label={t('bodyAddon.food.saveFood')}
        disabled={!valid || save.isPending}
        onPress={() =>
          kcal !== null &&
          save.mutate(
            {
              // A correction is a new own food; editing an own food replaces it.
              id: base && !correcting ? base.id : undefined,
              kind: 'custom',
              name: v.name.trim(),
              brand: v.brand.trim() || null,
              barcode: v.barcode.trim() || null,
              basis: v.basis,
              kcal,
              proteinG: macro(v.protein),
              carbsG: macro(v.carbs),
              fatG: macro(v.fat),
              pieceAmount: parse(v.piece) || null,
              portions:
                v.portionLabel.trim() && portion
                  ? [{ label: v.portionLabel.trim(), amount: portion }]
                  : [],
              recipe: null,
            },
            {
              onSuccess: (item) =>
                router.replace({ pathname: '/body/food/[id]', params: { id: item.id, meal, day } }),
            },
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
