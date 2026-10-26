import { recipeOf } from '@peakr/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { FoodItem } from '@/data/repositories/body-repository';
import type { Meal } from '@/features/body/meals';
import { Button, Card, ListState, numeric, Screen, spacing, Text, TextField } from '@/ui';

import { useFoodItem, useFoodSearch, useSaveFoodItem } from '../queries';
import { FoodRow } from './food-row';

type Ingredient = NonNullable<FoodItem['recipe']>['ingredients'][number];

const parse = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * A recipe: ingredients with their amounts, the weight of the finished dish and the number of
 * servings. The engine spreads the nutrients over the finished weight, so a portion is weighed
 * like any food (or taken as "1 serving").
 */
export function RecipeScreen({ id, meal, day }: { id?: string; meal: Meal; day: string }) {
  const food = useFoodItem(id);
  if (id && food.isPending) return <ListState kind="loading" label="…" />;
  return <Builder base={food.data ?? null} meal={meal} day={day} />;
}

function Builder({ base, meal, day }: { base: FoodItem | null; meal: Meal; day: string }) {
  const { t } = useTranslation();
  const save = useSaveFoodItem();
  const [name, setName] = useState(base?.name ?? '');
  const [ingredients, setIngredients] = useState<Ingredient[]>(base?.recipe?.ingredients ?? []);
  const [weight, setWeight] = useState(
    base?.recipe?.totalWeightG ? String(base.recipe.totalWeightG) : '',
  );
  const [servings, setServings] = useState(
    base?.recipe?.servings ? String(base.recipe.servings) : '',
  );
  const [query, setQuery] = useState('');
  const search = useFoodSearch(query);

  const recipe = recipeOf({
    ingredients: ingredients.map((i) => ({ per100: i.per100, amount: i.amount })),
    totalWeightG: parse(weight),
    servings: parse(servings),
  });

  const addIngredient = (f: FoodItem) => {
    setIngredients([
      ...ingredients,
      {
        foodId: f.id,
        name: f.name,
        amount: 100,
        per100: { kcal: f.kcal, proteinG: f.proteinG, carbsG: f.carbsG, fatG: f.fatG },
      },
    ]);
    setQuery('');
  };

  return (
    <Screen>
      <TextField label={t('bodyAddon.food.recipeName')} value={name} onChangeText={setName} />
      <Text variant="heading">{t('bodyAddon.food.ingredients')}</Text>
      {ingredients.map((ing, i) => (
        <View key={`${ing.foodId}-${i}`} style={styles.row}>
          <Text style={styles.flex}>{ing.name}</Text>
          <View style={styles.amount}>
            <TextField
              label={t('bodyAddon.food.grams')}
              suffix="g"
              keyboardType="decimal-pad"
              value={String(ing.amount)}
              onChangeText={(v) =>
                setIngredients(
                  ingredients.map((x, j) => (j === i ? { ...x, amount: parse(v) ?? 0 } : x)),
                )
              }
            />
          </View>
          <Button
            small
            variant="secondary"
            icon="trash"
            label={t('bodyAddon.diary.delete')}
            onPress={() => setIngredients(ingredients.filter((_, j) => j !== i))}
          />
        </View>
      ))}
      <TextField label={t('bodyAddon.food.addIngredient')} value={query} onChangeText={setQuery} />
      {query.trim()
        ? search.data?.local.map((f) => (
            <FoodRow
              key={f.id}
              name={f.name}
              brand={f.brand}
              kcal={f.kcal}
              basis={f.basis}
              onPress={() => addIngredient(f)}
            />
          ))
        : null}
      <TextField
        label={t('bodyAddon.food.totalWeight')}
        hint={t('bodyAddon.food.totalWeightHint')}
        suffix="g"
        keyboardType="decimal-pad"
        value={weight}
        onChangeText={setWeight}
      />
      <TextField
        label={t('bodyAddon.food.servings')}
        keyboardType="number-pad"
        value={servings}
        onChangeText={setServings}
      />
      {recipe ? (
        <Card style={styles.card} testID="recipe-preview">
          <Text style={numeric}>
            {t('bodyAddon.food.recipeTotal', {
              kcal: recipe.total.kcal,
              weight: recipe.totalWeightG,
            })}
          </Text>
          <Text tone="secondary" style={numeric}>
            {t('bodyAddon.food.per100Full', {
              basis: 'g',
              kcal: recipe.per100.kcal,
              p: recipe.per100.proteinG,
              c: recipe.per100.carbsG,
              f: recipe.per100.fatG,
            })}
          </Text>
          {recipe.servingG ? (
            <Text tone="secondary" style={numeric}>
              {t('bodyAddon.food.perServing', {
                grams: recipe.servingG,
                kcal: Math.round((recipe.per100.kcal * recipe.servingG) / 100),
              })}
            </Text>
          ) : null}
        </Card>
      ) : null}
      <Button
        label={t('bodyAddon.food.saveRecipe')}
        disabled={!recipe || !name.trim() || save.isPending}
        onPress={() =>
          recipe &&
          save.mutate(
            {
              id: base?.id,
              kind: 'recipe',
              name: name.trim(),
              brand: null,
              barcode: null,
              basis: 'g',
              kcal: recipe.per100.kcal,
              proteinG: recipe.per100.proteinG,
              carbsG: recipe.per100.carbsG,
              fatG: recipe.per100.fatG,
              pieceAmount: null,
              portions: recipe.servingG
                ? [{ label: t('bodyAddon.food.serving'), amount: recipe.servingG }]
                : [],
              recipe: { ingredients, totalWeightG: parse(weight), servings: parse(servings) },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  amount: { width: 110 },
  card: { gap: spacing.xs },
});
