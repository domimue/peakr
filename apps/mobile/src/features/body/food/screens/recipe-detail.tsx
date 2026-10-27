import { recipeServing, servingGrams, type RecipeServing } from '@peakr/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import type { FoodItem } from '@/data/repositories/body-repository';
import { useEntitlement } from '@/features/billing/billing-store';
import { MEALS, type Meal } from '@/features/body/meals';
import {
  Button,
  Card,
  ChipGroup,
  numeric,
  Screen,
  SegmentedControl,
  spacing,
  Text,
  TextField,
} from '@/ui';

import { ProgressPhoto } from '../../components/progress-photo';
import {
  useDeleteFoodItem,
  useDuplicateFoodItem,
  useLogRecipe,
  useToggleFavourite,
} from '../queries';
import { summaryOf } from '../recipes';
import { OffAttribution } from './food-row';
import { ingredientText, nutrientsText } from './recipe-text';

/** Quick amounts in portions; any other number can be typed. */
const QUICK = [0.5, 1, 1.5, 2] as const;
/** "I cooked double today" and friends. */
const SCALES = [0.5, 2, 3] as const;

const parse = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

const fraction = (n: number) => (n === 0.5 ? '½' : n === 1.5 ? '1½' : String(n));

/**
 * A recipe in the diary: what one portion holds, how much was eaten (portions, or grams when the
 * cooked dish was weighed), which meal – and add. Leftovers on another day are just this again.
 * Edit, duplicate, scale and delete; deleting never removes days it was logged on.
 */
export function RecipeDetail({ item, meal, day }: { item: FoodItem; meal: Meal; day: string }) {
  const { t } = useTranslation();
  const guard = useEntitlement('body_nutrition');
  const log = useLogRecipe();
  const favourite = useToggleFavourite();
  const duplicate = useDuplicateFoodItem();
  const remove = useDeleteFoodItem();
  const s = summaryOf(item.recipe);
  const [by, setBy] = useState<'portions' | 'grams'>('portions');
  const [portions, setPortions] = useState('1');
  const [grams, setGrams] = useState(s?.portionG ? String(s.portionG) : '');
  const [toMeal, setToMeal] = useState<Meal>(meal);
  if (!s || !item.recipe) return null;

  const weighed = s.cookedWeightG !== null;
  const serving: RecipeServing | null =
    by === 'grams' && weighed
      ? (() => {
          const g = parse(grams);
          return g ? { grams: g } : null;
        })()
      : (() => {
          const p = parse(portions);
          return p ? { portions: p } : null;
        })();
  const n = serving ? recipeServing(s, serving) : null;
  const g = serving ? servingGrams(s, serving) : null;
  const fromOff = item.recipe.ingredients.some((i) => i.source === 'off');

  const scale = (factor: number) =>
    router.push({
      pathname: '/body/food/recipe',
      params: { id: item.id, scale: String(factor), meal, day },
    });

  const confirmDelete = () =>
    Alert.alert(t('bodyAddon.recipes.deleteTitle'), t('bodyAddon.recipes.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('bodyAddon.recipes.delete'),
        style: 'destructive',
        onPress: () => remove.mutate(item.id, { onSuccess: () => router.back() }),
      },
    ]);

  return (
    <Screen>
      {item.recipe.photo && !item.recipe.photo.removed ? (
        <ProgressPhoto photo={item.recipe.photo} size={160} testID="recipe-photo" />
      ) : null}
      <Text variant="heading">{item.name}</Text>
      {item.recipe.note ? <Text tone="secondary">{item.recipe.note}</Text> : null}

      <Card style={styles.card} testID="recipe-per-portion">
        <Text variant="label">
          {s.portionG
            ? t('bodyAddon.recipes.perPortionWeight', { grams: s.portionG })
            : t('bodyAddon.recipes.perPortion')}
        </Text>
        <Text style={numeric}>{nutrientsText(t, s.perPortion)}</Text>
        <Text variant="caption" tone="secondary" style={numeric}>
          {t('bodyAddon.recipes.wholeDish', {
            count: s.portions,
            portions: fraction(s.portions),
            kcal: s.total.kcal,
          })}
        </Text>
      </Card>

      {weighed ? (
        <SegmentedControl
          options={[
            { value: 'portions', label: t('bodyAddon.recipes.byPortions') },
            { value: 'grams', label: t('bodyAddon.recipes.byWeight') },
          ]}
          value={by}
          onChange={setBy}
        />
      ) : null}
      {by === 'grams' && weighed ? (
        <TextField
          label={t('bodyAddon.recipes.grams')}
          hint={t('bodyAddon.recipes.gramsHint', { grams: s.cookedWeightG })}
          suffix="g"
          keyboardType="decimal-pad"
          value={grams}
          onChangeText={setGrams}
          testID="recipe-grams"
        />
      ) : (
        <>
          <ChipGroup
            label={t('bodyAddon.recipes.howMuch')}
            options={QUICK.map((q) => ({
              value: String(q),
              label: t('bodyAddon.recipes.portions', { count: q, value: fraction(q) }),
            }))}
            selected={QUICK.some((q) => String(q) === portions) ? [portions] : []}
            onToggle={setPortions}
          />
          <TextField
            label={t('bodyAddon.recipes.portionCount')}
            keyboardType="decimal-pad"
            value={portions}
            onChangeText={setPortions}
            testID="recipe-portions"
          />
        </>
      )}
      <ChipGroup
        label={t('bodyAddon.recipes.meal')}
        options={MEALS.map((m) => ({ value: m, label: t(`bodyAddon.meals.${m}`) }))}
        selected={[toMeal]}
        onToggle={setToMeal}
      />
      {n ? (
        <Card style={styles.card} testID="recipe-preview">
          <Text variant="title" style={numeric}>
            {t('bodyAddon.kcal', { kcal: n.kcal })}
          </Text>
          <Text tone="secondary" style={numeric}>
            {t('bodyAddon.diary.macros', { p: n.proteinG, c: n.carbsG, f: n.fatG })}
            {g ? ` · ${g} g` : ''}
          </Text>
        </Card>
      ) : null}
      <Button
        label={t('bodyAddon.food.add')}
        testID="recipe-log"
        disabled={!serving || !n || !guard.canWrite || log.isPending}
        onPress={() =>
          serving &&
          log.mutate(
            {
              food: item,
              serving,
              day,
              meal: toMeal,
              portionLabel: t('bodyAddon.recipes.portion'),
            },
            { onSuccess: () => router.dismissTo('/body') },
          )
        }
      />

      <View style={styles.card} testID="recipe-ingredients">
        <Text variant="label">{t('bodyAddon.food.ingredients')}</Text>
        {item.recipe.ingredients.map((i, k) => (
          <View key={`${i.foodId ?? i.name}-${k}`} style={styles.row}>
            <Text style={styles.flex}>{i.name}</Text>
            <Text tone="secondary" style={numeric}>
              {ingredientText(t, i)}
            </Text>
          </View>
        ))}
        {fromOff ? <OffAttribution /> : null}
      </View>

      {guard.canWrite ? (
        <>
          <View style={styles.actions}>
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
              icon="edit"
              testID="recipe-edit"
              label={t('bodyAddon.food.edit')}
              onPress={() =>
                router.push({ pathname: '/body/food/recipe', params: { id: item.id, meal, day } })
              }
            />
            <Button
              small
              variant="secondary"
              icon="copy"
              testID="recipe-duplicate"
              label={t('bodyAddon.recipes.duplicate')}
              onPress={() =>
                duplicate.mutate(
                  { id: item.id, name: t('bodyAddon.recipes.copyName', { name: item.name }) },
                  {
                    onSuccess: (copy) =>
                      copy &&
                      router.replace({
                        pathname: '/body/food/[id]',
                        params: { id: copy.id, meal, day },
                      }),
                  },
                )
              }
            />
          </View>
          <ChipGroup
            label={t('bodyAddon.recipes.scale')}
            options={SCALES.map((f) => ({ value: String(f), label: `× ${fraction(f)}` }))}
            selected={[]}
            onToggle={(f) => scale(Number(f))}
          />
          <Button
            small
            variant="secondary"
            icon="trash"
            testID="recipe-delete"
            label={t('bodyAddon.recipes.delete')}
            onPress={confirmDelete}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
