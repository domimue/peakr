import { amountOf, nutrientsFor, type PortionChoice } from '@peakr/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { Meal } from '@/features/body/meals';
import {
  Button,
  Card,
  ChipGroup,
  ListState,
  numeric,
  Screen,
  spacing,
  Text,
  TextField,
} from '@/ui';

import { foodDataOf, useFoodItem, useLogFood, useToggleFavourite } from '../queries';
import { OffAttribution } from './food-row';

type UnitKey = 'base' | 'piece' | `portion:${string}`;

const parse = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Portion picker: grams / millilitres, pieces or the product's portions, with a live preview of
 * kcal and macros (computed by the engine). Favourite, correct an Open Food Facts entry, add.
 */
export function FoodDetailScreen({ id, meal, day }: { id: string; meal: Meal; day: string }) {
  const { t } = useTranslation();
  const food = useFoodItem(id);
  const log = useLogFood();
  const favourite = useToggleFavourite();
  const [unit, setUnit] = useState<UnitKey | null>(null);
  const [amount, setAmount] = useState('');

  const item = food.data;
  if (food.isPending) return <ListState kind="loading" label={t('common.loading')} />;
  if (!item) return <ListState kind="empty" title={t('bodyAddon.food.notFound')} />;

  const data = foodDataOf(item);
  const units: { key: UnitKey; label: string }[] = [
    { key: 'base', label: item.basis },
    ...(item.pieceAmount ? [{ key: 'piece' as const, label: t('bodyAddon.food.piece') }] : []),
    ...item.portions.map((p) => ({ key: `portion:${p.label}` as const, label: p.label })),
  ];
  const current: UnitKey =
    unit ?? (item.portions[0] ? `portion:${item.portions[0].label}` : 'base');
  const value = parse(amount) ?? (current === 'base' ? 100 : 1);
  const choice: PortionChoice =
    current === 'base'
      ? { unit: 'base', amount: value }
      : current === 'piece'
        ? { unit: 'piece', count: value }
        : { unit: 'portion', label: current.slice('portion:'.length), count: value };
  const grams = amountOf(data, choice);
  const n = grams === null ? null : nutrientsFor(data.per100, grams);

  return (
    <Screen>
      <Text variant="heading">{item.name}</Text>
      {item.brand ? <Text tone="secondary">{item.brand}</Text> : null}
      <Text tone="secondary" style={numeric}>
        {t('bodyAddon.food.per100Full', {
          basis: item.basis,
          kcal: item.kcal,
          p: item.proteinG,
          c: item.carbsG,
          f: item.fatG,
        })}
      </Text>

      <ChipGroup
        label={t('bodyAddon.food.unit')}
        options={units.map((u) => ({ value: u.key, label: u.label }))}
        selected={[current]}
        onToggle={(k) => {
          setUnit(k);
          setAmount('');
        }}
      />
      <TextField
        label={
          current === 'base'
            ? t('bodyAddon.food.amount', { basis: item.basis })
            : t('bodyAddon.food.count')
        }
        keyboardType="decimal-pad"
        placeholder={current === 'base' ? '100' : '1'}
        value={amount}
        onChangeText={setAmount}
      />
      {n && grams !== null ? (
        <Card style={styles.card} testID="food-preview">
          <Text variant="title" style={numeric}>
            {t('bodyAddon.kcal', { kcal: n.kcal })}
          </Text>
          <Text tone="secondary" style={numeric}>
            {t('bodyAddon.diary.macros', { p: n.proteinG, c: n.carbsG, f: n.fatG })} ·{' '}
            {`${Math.round(grams)} ${item.basis}`}
          </Text>
        </Card>
      ) : null}

      <Button
        label={t('bodyAddon.food.add')}
        disabled={!n || log.isPending}
        onPress={() =>
          log.mutate(
            { food: item, choice, day, meal },
            { onSuccess: () => router.dismissTo('/body') },
          )
        }
      />
      <View style={styles.row}>
        <Button
          small
          variant="secondary"
          testID="food-favourite"
          label={t(item.favourite ? 'bodyAddon.food.unfavourite' : 'bodyAddon.food.favourite')}
          onPress={() => favourite.mutate({ id: item.id, favourite: !item.favourite })}
        />
        <Button
          small
          variant="secondary"
          label={t(item.kind === 'off' ? 'bodyAddon.food.correct' : 'bodyAddon.food.edit')}
          onPress={() =>
            router.push(
              item.kind === 'recipe'
                ? { pathname: '/body/food/recipe', params: { id: item.id, meal, day } }
                : { pathname: '/body/food/new', params: { id: item.id, meal, day } },
            )
          }
        />
      </View>
      {item.kind === 'off' ? <OffAttribution /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
