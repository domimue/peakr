/**
 * Food maths of the Body add-on's diary (CLAUDE.md "Energy & body rules": all of it here, never
 * in the UI): nutrients per 100 g / ml, portions, recipes, day and meal totals, macro targets.
 */

export interface Nutrients {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export const ZERO: Nutrients = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

/** What a food is measured in: its nutrients are per 100 of this. */
export type FoodBasis = 'g' | 'ml';

/** A named portion of a product ("1 bar", "1 cup"), in grams or millilitres of the basis. */
export interface Portion {
  label: string;
  amount: number;
}

export interface FoodData {
  basis: FoodBasis;
  per100: Nutrients;
  /** Weight of one piece (eggs, bananas), in the basis unit. */
  pieceAmount?: number | null;
  portions?: readonly Portion[];
}

/** How much was eaten: in the basis unit, in pieces, or as one of the product's portions. */
export type PortionChoice =
  | { unit: 'base'; amount: number }
  | { unit: 'piece'; count: number }
  | { unit: 'portion'; label: string; count: number };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The amount in the food's basis unit (g or ml), or null if the choice does not fit the food. */
export function amountOf(food: FoodData, choice: PortionChoice): number | null {
  switch (choice.unit) {
    case 'base':
      return choice.amount > 0 ? choice.amount : null;
    case 'piece':
      return food.pieceAmount && choice.count > 0 ? food.pieceAmount * choice.count : null;
    case 'portion': {
      const p = food.portions?.find((x) => x.label === choice.label);
      return p && choice.count > 0 ? p.amount * choice.count : null;
    }
  }
}

/** Nutrients of an amount (in the basis unit) of a food. */
export function nutrientsFor(per100: Nutrients, amount: number): Nutrients {
  const f = amount / 100;
  return {
    kcal: Math.round(per100.kcal * f),
    proteinG: r1(per100.proteinG * f),
    carbsG: r1(per100.carbsG * f),
    fatG: r1(per100.fatG * f),
  };
}

export function sumNutrients(items: readonly Nutrients[]): Nutrients {
  const t = items.reduce(
    (s, n) => ({
      kcal: s.kcal + n.kcal,
      proteinG: s.proteinG + n.proteinG,
      carbsG: s.carbsG + n.carbsG,
      fatG: s.fatG + n.fatG,
    }),
    ZERO,
  );
  return {
    kcal: Math.round(t.kcal),
    proteinG: r1(t.proteinG),
    carbsG: r1(t.carbsG),
    fatG: r1(t.fatG),
  };
}

/** Quick add: kcal alone, macros optional (missing ones count as 0). */
export function quickAdd(input: Partial<Nutrients> & { kcal: number }): Nutrients {
  return {
    kcal: Math.max(0, Math.round(input.kcal)),
    proteinG: r1(Math.max(0, input.proteinG ?? 0)),
    carbsG: r1(Math.max(0, input.carbsG ?? 0)),
    fatG: r1(Math.max(0, input.fatG ?? 0)),
  };
}

export interface RecipeIngredient {
  per100: Nutrients;
  /** Amount used, in the ingredient's basis unit. */
  amount: number;
}

export interface Recipe {
  /** Per 100 g of the finished dish. */
  per100: Nutrients;
  total: Nutrients;
  /** Weight of the finished dish (cooking changes it: water evaporates or is absorbed). */
  totalWeightG: number;
  /** One serving, when the dish is split into `servings`. */
  servingG: number | null;
}

/**
 * A recipe from its ingredients: the total nutrients spread over the weight of the finished
 * dish, so a portion is weighed like any food. Without a weighed total the raw sum is used.
 */
export function recipeOf(input: {
  ingredients: readonly RecipeIngredient[];
  totalWeightG?: number | null;
  servings?: number | null;
}): Recipe | null {
  if (input.ingredients.length === 0) return null;
  const total = sumNutrients(input.ingredients.map((i) => nutrientsFor(i.per100, i.amount)));
  const raw = input.ingredients.reduce((s, i) => s + i.amount, 0);
  const weight = input.totalWeightG && input.totalWeightG > 0 ? input.totalWeightG : raw;
  if (!(weight > 0)) return null;
  const f = 100 / weight;
  return {
    total,
    per100: {
      kcal: Math.round(total.kcal * f),
      proteinG: r1(total.proteinG * f),
      carbsG: r1(total.carbsG * f),
      fatG: r1(total.fatG * f),
    },
    totalWeightG: Math.round(weight),
    servingG: input.servings && input.servings > 0 ? Math.round(weight / input.servings) : null,
  };
}

export interface MacroTargets {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

/**
 * Macro targets for the day: protein from the goal (1.6–2.2 g/kg), fat 30 % of the energy but at
 * least 0.6 g/kg, carbohydrates the rest. Targets to aim at, not limits.
 */
export function macroTargets(input: {
  kcal: number;
  proteinG: number;
  weightKg: number;
}): MacroTargets {
  const fat = Math.max((input.kcal * 0.3) / 9, input.weightKg * 0.6);
  const carbs = Math.max(0, (input.kcal - input.proteinG * 4 - fat * 9) / 4);
  return {
    kcal: Math.round(input.kcal),
    proteinG: Math.round(input.proteinG),
    fatG: Math.round(fat),
    carbsG: Math.round(carbs),
  };
}

/** Share of a target reached, 0…1 for the ring (above 1 is shown as full plus the overshoot). */
export function progressOf(eaten: number, target: number): { share: number; over: number } {
  if (!(target > 0)) return { share: 0, over: 0 };
  return { share: Math.min(1, eaten / target), over: Math.max(0, Math.round(eaten - target)) };
}
