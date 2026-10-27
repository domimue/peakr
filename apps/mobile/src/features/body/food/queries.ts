import {
  amountOf,
  nutrientsFor,
  recipeServing,
  relogEntry,
  type FoodData,
  type OffFood,
  type PortionChoice,
  type RecipeServing,
} from '@peakr/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as repo from '@/data/repositories/body-repository';
import type { FoodItem, FoodItemDraft, Meal } from '@/data/repositories/body-repository';
import { useEntitlement } from '@/features/billing/billing-store';

import { assertCanWrite, bodyKeys } from '../queries';
import { syncEntryToHealth } from './health-nutrition';
import { cacheOffResult, lookupBarcode, searchOff } from './off-client';
import { recipeFoodColumns, summaryOf } from './recipes';
import type { DraftIngredient, DraftPhoto } from './recipe-draft';

/**
 * Food database hooks. Reads need the guard's `canRead`, writes `canWrite` (like every Body
 * write); the server checks the same (RLS). Logging works fully offline – OFF only adds results.
 */

/** A stored food as the engine reads it. */
export function foodDataOf(food: FoodItem): FoodData {
  return {
    basis: food.basis,
    per100: { kcal: food.kcal, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG },
    pieceAmount: food.pieceAmount,
    portions: food.portions,
  };
}

export const foodKeys = {
  all: ['body', 'foods'] as const,
  search: (q: string) => ['body', 'foods', 'search', q] as const,
  list: (f: string) => ['body', 'foods', 'list', f] as const,
  item: (id: string) => ['body', 'foods', 'item', id] as const,
};

export interface SearchResults {
  local: FoodItem[];
  /** OFF results not already in the local table; null when offline. */
  online: OffFood[] | null;
}

/** Search; `recipes` limits it to the user's recipes ("My recipes", no Open Food Facts). */
export function useFoodSearch(query: string, recipes = false) {
  const guard = useEntitlement('body_nutrition');
  return useQuery({
    queryKey: [...foodKeys.search(query), recipes ? 'recipes' : 'all'],
    enabled: guard.canRead && query.trim().length > 0,
    queryFn: async (): Promise<SearchResults> => {
      const local = await repo.searchFoodItems(query, 30, recipes ? 'recipe' : undefined);
      if (recipes) return { local, online: [] };
      const online = await searchOff(query);
      const known = new Set(local.map((f) => f.barcode).filter(Boolean));
      return { local, online: online && online.filter((f) => !known.has(f.barcode)) };
    },
  });
}

export function useFoodList(filter: 'recent' | 'favourites' | 'custom' | 'recipes') {
  const guard = useEntitlement('body_nutrition');
  return useQuery({
    queryKey: foodKeys.list(filter),
    enabled: guard.canRead,
    queryFn: () => (filter === 'recent' ? repo.recentFoodItems() : repo.listFoodItems(filter)),
  });
}

export function useFoodItem(id: string | undefined) {
  return useQuery({
    queryKey: foodKeys.item(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => repo.getFoodItem(id ?? ''),
  });
}

function useFoodWrite<T, R>(fn: (input: T) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: T) => {
      assertCanWrite();
      return fn(input);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: bodyKeys.all });
    },
  });
}

export const useLookupBarcode = () => useFoodWrite(lookupBarcode);
export const usePickOffResult = () => useFoodWrite(cacheOffResult);
export const useSaveFoodItem = () => useFoodWrite((d: FoodItemDraft) => repo.saveFoodItem(d));
export const useToggleFavourite = () =>
  useFoodWrite((v: { id: string; favourite: boolean }) => repo.setFavourite(v.id, v.favourite));
export const useDeleteFoodItem = () => useFoodWrite(repo.deleteFoodItem);
export const useCopyEntries = () =>
  useFoodWrite(async (v: { fromDay: string; toDay: string; meal?: Meal; toMeal?: Meal }) => {
    const copies = await repo.copyEntries(v);
    for (const e of copies) await syncEntryToHealth(e);
    return copies;
  });

/** Logs an amount of a food: the engine computes the nutrients from the portion. */
export const useLogFood = () =>
  useFoodWrite(async (v: { food: FoodItem; choice: PortionChoice; day: string; meal: Meal }) => {
    const data = foodDataOf(v.food);
    const amount = amountOf(data, v.choice);
    if (amount === null) throw new Error('invalid portion');
    const n = nutrientsFor(data.per100, amount);
    const entry = await repo.addFood({
      day: v.day,
      meal: v.meal,
      name: v.food.brand ? `${v.food.name} (${v.food.brand})` : v.food.name,
      kcal: n.kcal,
      proteinG: n.proteinG,
      carbsG: n.carbsG,
      fatG: n.fatG,
      foodId: v.food.id,
      amount: v.choice.unit === 'base' ? v.choice.amount : v.choice.count,
      unit: v.choice.unit === 'base' ? v.food.basis : v.choice.unit,
      portionLabel: v.choice.unit === 'portion' ? v.choice.label : null,
    });
    await syncEntryToHealth(entry);
    return entry;
  });

/** Logs a recipe: a number of portions, or grams of the weighed dish. */
export const useLogRecipe = () =>
  useFoodWrite(
    async (v: {
      food: FoodItem;
      serving: RecipeServing;
      day: string;
      meal: Meal;
      portionLabel: string;
    }) => {
      const s = summaryOf(v.food.recipe);
      const n = s && recipeServing(s, v.serving);
      if (!n) throw new Error('invalid serving');
      const entry = await repo.addFood({
        day: v.day,
        meal: v.meal,
        name: v.food.name,
        ...n,
        foodId: v.food.id,
        ...('portions' in v.serving
          ? { amount: v.serving.portions, unit: 'portion' as const, portionLabel: v.portionLabel }
          : { amount: v.serving.grams, unit: 'g' as const, portionLabel: null }),
      });
      await syncEntryToHealth(entry);
      return entry;
    },
  );

export interface RecipeSave {
  id: string | null;
  name: string;
  note: string;
  photo: DraftPhoto;
  ingredients: readonly DraftIngredient[];
  portions: number;
  cookedWeightG: number | null;
  /**
   * Entries already logged keep the values they were logged with. Only when the user chose
   * "update them too" are they recomputed with the new recipe.
   */
  updateLogged?: boolean;
}

/** Saves a recipe (new or edited); returns it with the number of entries recomputed. */
export const useSaveRecipe = () =>
  useFoodWrite(async (v: RecipeSave) => {
    const recipe = {
      ingredients: v.ingredients.map(({ key: _k, ...i }) => i),
      servings: v.portions,
      totalWeightG: v.cookedWeightG,
      note: v.note.trim() || null,
      photo: v.photo.kind === 'saved' ? v.photo.photo : null,
    };
    const s = summaryOf(recipe);
    if (!s) throw new Error('empty recipe');
    const item = await repo.saveFoodItem(
      {
        id: v.id ?? undefined,
        kind: 'recipe',
        name: v.name.trim(),
        brand: null,
        barcode: null,
        ...recipeFoodColumns(s),
        recipe,
      },
      v.photo.kind === 'picked' ? v.photo.uri : v.photo.kind === 'removed' ? null : undefined,
    );
    let updated = 0;
    if (v.id && v.updateLogged) {
      const changes = (await repo.entriesOfFood(v.id)).flatMap((e) => {
        const n = relogEntry(e, s);
        return n ? [{ id: e.id, ...n }] : [];
      });
      const entries = await repo.updateEntryValues(changes);
      for (const e of entries) await syncEntryToHealth(e);
      updated = entries.length;
    }
    return { item, updated };
  });

/** How many diary entries were logged from a food (for the question when editing a recipe). */
export function useLoggedCount(id: string | null) {
  return useQuery({
    queryKey: ['body', 'foods', 'logged', id ?? ''],
    enabled: Boolean(id),
    queryFn: async () => (await repo.entriesOfFood(id ?? '')).length,
  });
}

export const useDuplicateFoodItem = () =>
  useFoodWrite((v: { id: string; name: string }) => repo.duplicateFoodItem(v.id, v.name));
