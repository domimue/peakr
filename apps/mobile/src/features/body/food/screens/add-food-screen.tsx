import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { Meal } from '@/features/body/meals';
import { Button, Card, ListState, Screen, SegmentedControl, spacing, Text, TextField } from '@/ui';

import { useFoodList, useFoodSearch, usePickOffResult } from '../queries';
import { FoodRow, OffAttribution } from './food-row';

type List = 'recent' | 'favourites' | 'custom' | 'recipes';

/**
 * Adding food to a meal: search (own foods and the cache offline, Open Food Facts online),
 * recent foods, favourites, own foods and recipes, the barcode scanner, and creating a food or a
 * recipe. Picking a food opens the portion picker.
 */
export function AddFoodScreen({ meal, day }: { meal: Meal; day: string }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [list, setList] = useState<List>('recent');
  const search = useFoodSearch(query);
  const lists = useFoodList(list);
  const pick = usePickOffResult();
  const open = (id: string) =>
    router.push({ pathname: '/body/food/[id]', params: { id, meal, day } });

  return (
    <Screen>
      <Text tone="secondary">
        {t('bodyAddon.food.addTo', { meal: t(`bodyAddon.meals.${meal}`) })}
      </Text>
      <View style={styles.row}>
        <Button
          icon="search"
          label={t('bodyAddon.food.scan')}
          onPress={() => router.push({ pathname: '/body/food/scan', params: { meal, day } })}
        />
      </View>
      <TextField
        label={t('bodyAddon.food.search')}
        placeholder={t('bodyAddon.food.searchHint')}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />

      {query.trim() ? (
        search.isPending ? (
          <ListState kind="loading" label={t('common.loading')} />
        ) : (
          <Card style={styles.card} testID="food-search-results">
            {search.data?.local.map((f) => (
              <FoodRow
                key={f.id}
                name={f.name}
                brand={f.brand}
                kcal={f.kcal}
                basis={f.basis}
                onPress={() => open(f.id)}
              />
            ))}
            {search.data?.online?.map((f) => (
              <FoodRow
                key={f.barcode}
                testID={`off-${f.barcode}`}
                name={f.name}
                brand={f.brand}
                kcal={f.per100.kcal}
                basis={f.basis}
                onPress={() => pick.mutate(f, { onSuccess: (item) => open(item.id) })}
              />
            ))}
            {search.data &&
            search.data.local.length === 0 &&
            (search.data.online?.length ?? 0) === 0 ? (
              <Text tone="secondary">{t('bodyAddon.food.noResults')}</Text>
            ) : null}
            {search.data?.online === null ? (
              <Text variant="caption" tone="secondary" testID="food-offline">
                {t('bodyAddon.food.offline')}
              </Text>
            ) : (
              <OffAttribution />
            )}
          </Card>
        )
      ) : (
        <>
          <SegmentedControl
            options={[
              { value: 'recent', label: t('bodyAddon.food.lists.recent') },
              { value: 'favourites', label: t('bodyAddon.food.lists.favourites') },
              { value: 'custom', label: t('bodyAddon.food.lists.custom') },
              { value: 'recipes', label: t('bodyAddon.food.lists.recipes') },
            ]}
            value={list}
            onChange={setList}
          />
          <Card style={styles.card} testID={`food-list-${list}`}>
            {lists.data?.length ? (
              lists.data.map((f) => (
                <FoodRow
                  key={f.id}
                  name={f.name}
                  brand={f.brand}
                  kcal={f.kcal}
                  basis={f.basis}
                  onPress={() => open(f.id)}
                />
              ))
            ) : (
              <Text tone="secondary">{t(`bodyAddon.food.empty.${list}`)}</Text>
            )}
          </Card>
        </>
      )}

      <View style={styles.row}>
        <Button
          small
          variant="secondary"
          icon="plus"
          label={t('bodyAddon.food.createFood')}
          onPress={() => router.push({ pathname: '/body/food/new', params: { meal, day } })}
        />
        <Button
          small
          variant="secondary"
          icon="plus"
          label={t('bodyAddon.food.createRecipe')}
          onPress={() => router.push({ pathname: '/body/food/recipe', params: { meal, day } })}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: { gap: spacing.xs },
});
