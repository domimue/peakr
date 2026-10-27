import { recipeSummary, type RecipeSummary } from '@peakr/engine';

import type { StoredRecipe } from '@/data/db/schema';
import type { FoodItem, FoodItemDraft } from '@/data/repositories/body-repository';

/**
 * Recipes as diary foods (CLAUDE.md "Energy & body rules → Recipes"). The engine adds them up;
 * here they are read from and written to the stored food.
 */

/** The label of a recipe's portion in its stored `portions` (the UI shows its own word). */
export const RECIPE_PORTION = 'portion';

/** Totals and per portion of a stored recipe (older ones: servings missing = one portion). */
export function summaryOf(recipe: StoredRecipe | null | undefined): RecipeSummary | null {
  if (!recipe) return null;
  return recipeSummary({
    ingredients: recipe.ingredients,
    portions: recipe.servings && recipe.servings > 0 ? recipe.servings : 1,
    cookedWeightG: recipe.totalWeightG,
  });
}

export const isRecipe = (f: FoodItem) => f.kind === 'recipe';

/**
 * The food columns of a recipe: nutrients per 100 g of the cooked dish (of the raw ingredients
 * when it was not weighed) and one portion – so lists and an ingredient pick work like any food.
 */
export function recipeFoodColumns(
  s: RecipeSummary,
): Pick<
  FoodItemDraft,
  'basis' | 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'pieceAmount' | 'portions'
> {
  const weight = s.cookedWeightG ?? s.rawWeightG;
  const f = weight > 0 ? 100 / weight : 0;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    basis: 'g',
    kcal: Math.min(1000, Math.round(s.total.kcal * f)),
    proteinG: Math.min(100, r1(s.total.proteinG * f)),
    carbsG: Math.min(100, r1(s.total.carbsG * f)),
    fatG: Math.min(100, r1(s.total.fatG * f)),
    pieceAmount: null,
    portions: [{ label: RECIPE_PORTION, amount: Math.max(1, Math.round(weight / s.portions)) }],
  };
}
