import {
  amountOf,
  nutrientsFor,
  type FoodData,
  type OffFood,
  type PortionChoice,
} from '@peakr/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as repo from '@/data/repositories/body-repository';
import type { FoodItem, FoodItemDraft, Meal } from '@/data/repositories/body-repository';
import { useEntitlement } from '@/features/billing/billing-store';

import { assertCanWrite, bodyKeys } from '../queries';
import { syncEntryToHealth } from './health-nutrition';
import { cacheOffResult, lookupBarcode, searchOff } from './off-client';

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

export function useFoodSearch(query: string) {
  const guard = useEntitlement('body_nutrition');
  return useQuery({
    queryKey: foodKeys.search(query),
    enabled: guard.canRead && query.trim().length > 0,
    queryFn: async (): Promise<SearchResults> => {
      const local = await repo.searchFoodItems(query);
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
