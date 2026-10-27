import {
  amountOf,
  nutrientsFor,
  sumNutrients,
  type FoodData,
  type Nutrients,
  type PortionChoice,
} from './nutrients';

/**
 * Recipes of the diary (CLAUDE.md "Energy & body rules → Recipes"): a pot cooked once and eaten
 * over several days. The whole dish is the sum of its ingredients; a portion is a share of it –
 * counted (1, ½, 1½ portions) or, when the cooked dish was weighed, by weight (1,200 g in 4
 * portions = 300 g each, and 380 g eaten are 380 / 1,200 of the dish). Logged entries keep the
 * values they were logged with; `relogEntry` exists only for an explicit "update them too".
 */

/** How an ingredient amount was entered; the amount itself is always in the basis unit. */
export type IngredientUnit = 'g' | 'ml' | 'piece' | 'portion';

export interface IngredientAmount {
  /** In the ingredient's basis unit (g or ml). */
  amount: number;
  unit: IngredientUnit;
  /** Pieces or portions, when entered that way. */
  count: number | null;
  portionLabel: string | null;
}

/**
 * The amount of an ingredient from what the user picked (grams / millilitres, pieces or one of
 * the product's portions); null if the choice does not fit the food.
 */
export function ingredientAmount(food: FoodData, choice: PortionChoice): IngredientAmount | null {
  const amount = amountOf(food, choice);
  if (amount === null) return null;
  if (choice.unit === 'base') return { amount, unit: food.basis, count: null, portionLabel: null };
  return {
    amount,
    unit: choice.unit,
    count: choice.count,
    portionLabel: choice.unit === 'portion' ? choice.label : null,
  };
}

export interface RecipeInput {
  ingredients: readonly { per100: Nutrients; amount: number }[];
  /** How many portions the whole dish makes. */
  portions: number;
  /** Weight of the finished dish, if weighed (cooking changes it). */
  cookedWeightG?: number | null;
}

export interface RecipeSummary {
  /** The whole dish. */
  total: Nutrients;
  /** Sum of the ingredient amounts (millilitres counted as grams – an approximation). */
  rawWeightG: number;
  portions: number;
  perPortion: Nutrients;
  /** Only with a weighed cooked dish: then a portion can be taken by weight. */
  cookedWeightG: number | null;
  portionG: number | null;
  per100: Nutrients | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function share(total: Nutrients, f: number): Nutrients {
  return {
    kcal: Math.round(total.kcal * f),
    proteinG: r1(total.proteinG * f),
    carbsG: r1(total.carbsG * f),
    fatG: r1(total.fatG * f),
  };
}

/** Totals for the whole dish and per portion; null while there is nothing to add up. */
export function recipeSummary(input: RecipeInput): RecipeSummary | null {
  const used = input.ingredients.filter((i) => i.amount > 0);
  if (used.length === 0 || !(input.portions > 0)) return null;
  const total = sumNutrients(used.map((i) => nutrientsFor(i.per100, i.amount)));
  const raw = used.reduce((s, i) => s + i.amount, 0);
  const cooked = input.cookedWeightG && input.cookedWeightG > 0 ? input.cookedWeightG : null;
  return {
    total,
    rawWeightG: Math.round(raw),
    portions: input.portions,
    perPortion: share(total, 1 / input.portions),
    cookedWeightG: cooked === null ? null : Math.round(cooked),
    portionG: cooked === null ? null : Math.round(cooked / input.portions),
    per100: cooked === null ? null : share(total, 100 / cooked),
  };
}

/** How much of a recipe was eaten: a number of portions, or grams of the weighed dish. */
export type RecipeServing = { portions: number } | { grams: number };

/** Nutrients of a serving; grams only when the cooked dish was weighed. */
export function recipeServing(s: RecipeSummary, serving: RecipeServing): Nutrients | null {
  if ('portions' in serving) {
    return serving.portions > 0 ? share(s.total, serving.portions / s.portions) : null;
  }
  if (s.cookedWeightG === null || !(serving.grams > 0)) return null;
  return share(s.total, serving.grams / s.cookedWeightG);
}

/** The grams a serving weighs, when known. */
export function servingGrams(s: RecipeSummary, serving: RecipeServing): number | null {
  if ('grams' in serving) return serving.grams;
  return s.portionG === null ? null : Math.round(s.portionG * serving.portions);
}

export interface ScalableRecipe<I extends { amount: number; count: number | null }> {
  ingredients: readonly I[];
  portions: number;
  cookedWeightG: number | null;
}

/**
 * "I cooked double today": every ingredient, the cooked weight and the number of portions times
 * the factor – a portion stays the same size.
 */
export function scaleRecipe<I extends { amount: number; count: number | null }>(
  recipe: ScalableRecipe<I>,
  factor: number,
): ScalableRecipe<I> {
  if (!(factor > 0)) throw new Error('scale factor must be positive');
  return {
    ingredients: recipe.ingredients.map((i) => ({
      ...i,
      amount: r1(i.amount * factor),
      count: i.count === null ? null : Math.round(i.count * factor * 100) / 100,
    })),
    portions: Math.round(recipe.portions * factor * 100) / 100,
    cookedWeightG: recipe.cookedWeightG === null ? null : Math.round(recipe.cookedWeightG * factor),
  };
}

/**
 * A logged entry recomputed with a changed recipe – only when the user chose to update the
 * entries already logged (the default leaves them as they were). Null when the entry cannot be
 * expressed in the new recipe (grams without a weighed dish).
 */
export function relogEntry(
  entry: { unit: string | null; amount: number | null },
  s: RecipeSummary,
): Nutrients | null {
  if (entry.amount === null || !(entry.amount > 0)) return null;
  if (entry.unit === 'portion') return recipeServing(s, { portions: entry.amount });
  if (entry.unit === 'g') return recipeServing(s, { grams: entry.amount });
  return null;
}
