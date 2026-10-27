import { describe, expect, it } from 'vitest';

import {
  ingredientAmount,
  recipeServing,
  recipeSummary,
  relogEntry,
  scaleRecipe,
  servingGrams,
  type FoodData,
} from '.';

const pasta = { per100: { kcal: 350, proteinG: 12, carbsG: 72, fatG: 1.5 }, amount: 400 };
const sauce = { per100: { kcal: 30, proteinG: 1.5, carbsG: 5, fatG: 0.2 }, amount: 800 };
const egg: FoodData = {
  basis: 'g',
  per100: { kcal: 143, proteinG: 12.6, carbsG: 0.7, fatG: 9.5 },
  pieceAmount: 60,
  portions: [{ label: '1 box', amount: 600 }],
};
const milk: FoodData = { basis: 'ml', per100: { kcal: 64, proteinG: 3.4, carbsG: 4.8, fatG: 3.5 } };

describe('recipe summary', () => {
  it('totals the dish and divides it into portions', () => {
    const s = recipeSummary({ ingredients: [pasta, sauce], portions: 4, cookedWeightG: 1200 });
    expect(s).toEqual({
      total: { kcal: 1640, proteinG: 60, carbsG: 328, fatG: 7.6 },
      rawWeightG: 1200,
      portions: 4,
      perPortion: { kcal: 410, proteinG: 15, carbsG: 82, fatG: 1.9 },
      cookedWeightG: 1200,
      portionG: 300,
      per100: { kcal: 137, proteinG: 5, carbsG: 27.3, fatG: 0.6 },
    });
  });

  it('without a cooked weight there is no portion weight and no per 100 g', () => {
    const s = recipeSummary({ ingredients: [pasta], portions: 2 });
    expect(s?.cookedWeightG).toBeNull();
    expect(s?.portionG).toBeNull();
    expect(s?.per100).toBeNull();
    expect(s?.perPortion.kcal).toBe(700);
    expect(recipeSummary({ ingredients: [pasta], portions: 2, cookedWeightG: 0 })?.per100).toBe(
      null,
    );
  });

  it('nothing to add up: no ingredients, only zero amounts, no portions', () => {
    expect(recipeSummary({ ingredients: [], portions: 4 })).toBeNull();
    expect(recipeSummary({ ingredients: [{ ...pasta, amount: 0 }], portions: 4 })).toBeNull();
    expect(recipeSummary({ ingredients: [pasta], portions: 0 })).toBeNull();
  });
});

describe('servings', () => {
  const s = recipeSummary({ ingredients: [pasta, sauce], portions: 4, cookedWeightG: 1200 })!;

  it('by portions: one, a half, one and a half', () => {
    expect(recipeServing(s, { portions: 1 })?.kcal).toBe(410);
    expect(recipeServing(s, { portions: 0.5 })?.kcal).toBe(205);
    expect(recipeServing(s, { portions: 1.5 })).toEqual(
      expect.objectContaining({ kcal: 615, proteinG: 22.5, carbsG: 123 }),
    );
    expect(recipeServing(s, { portions: 0 })).toBeNull();
  });

  it('by weight of the cooked dish: 380 g of 1,200 g', () => {
    expect(recipeServing(s, { grams: 380 })?.kcal).toBe(Math.round((1640 * 380) / 1200));
    expect(recipeServing(s, { grams: 0 })).toBeNull();
    const unweighed = recipeSummary({ ingredients: [pasta], portions: 2 })!;
    expect(recipeServing(unweighed, { grams: 380 })).toBeNull();
  });

  it('the grams of a serving', () => {
    expect(servingGrams(s, { portions: 1.5 })).toBe(450);
    expect(servingGrams(s, { grams: 380 })).toBe(380);
    expect(
      servingGrams(recipeSummary({ ingredients: [pasta], portions: 2 })!, { portions: 1 }),
    ).toBe(null);
  });
});

describe('ingredient units', () => {
  it('grams, millilitres, pieces and product portions all end in the basis unit', () => {
    expect(ingredientAmount(egg, { unit: 'base', amount: 120 })).toEqual({
      amount: 120,
      unit: 'g',
      count: null,
      portionLabel: null,
    });
    expect(ingredientAmount(milk, { unit: 'base', amount: 250 })?.unit).toBe('ml');
    expect(ingredientAmount(egg, { unit: 'piece', count: 3 })).toEqual({
      amount: 180,
      unit: 'piece',
      count: 3,
      portionLabel: null,
    });
    expect(ingredientAmount(egg, { unit: 'portion', label: '1 box', count: 0.5 })).toEqual({
      amount: 300,
      unit: 'portion',
      count: 0.5,
      portionLabel: '1 box',
    });
    expect(ingredientAmount(milk, { unit: 'piece', count: 1 })).toBeNull();
  });
});

describe('scaling', () => {
  it('double: twice the ingredients, cooked weight and portions – the same portion', () => {
    const recipe = {
      ingredients: [
        { ...pasta, count: null },
        { ...sauce, count: 2 },
      ],
      portions: 4,
      cookedWeightG: 1200,
    };
    const doubled = scaleRecipe(recipe, 2);
    expect(doubled.ingredients.map((i) => [i.amount, i.count])).toEqual([
      [800, null],
      [1600, 4],
    ]);
    expect(doubled.portions).toBe(8);
    expect(doubled.cookedWeightG).toBe(2400);
    const a = recipeSummary(recipe)!;
    const b = recipeSummary(doubled)!;
    expect(b.perPortion).toEqual(a.perPortion);
    expect(b.portionG).toBe(a.portionG);
    expect(scaleRecipe({ ...recipe, cookedWeightG: null }, 0.5).cookedWeightG).toBeNull();
    expect(() => scaleRecipe(recipe, 0)).toThrow();
  });
});

describe('relogging an entry after an edit (only when chosen)', () => {
  const before = recipeSummary({ ingredients: [pasta, sauce], portions: 4, cookedWeightG: 1200 })!;
  const after = recipeSummary({
    ingredients: [pasta, { ...sauce, amount: 400 }],
    portions: 4,
    cookedWeightG: 1000,
  })!;

  it('portions and grams are recomputed with the new recipe', () => {
    expect(relogEntry({ unit: 'portion', amount: 1 }, before)?.kcal).toBe(410);
    expect(relogEntry({ unit: 'portion', amount: 1 }, after)?.kcal).toBe(380);
    expect(relogEntry({ unit: 'g', amount: 380 }, after)?.kcal).toBe(
      Math.round((1520 * 380) / 1000),
    );
  });

  it('what cannot be expressed in the new recipe stays as it was', () => {
    expect(relogEntry({ unit: 'piece', amount: 1 }, after)).toBeNull();
    expect(relogEntry({ unit: 'portion', amount: null }, after)).toBeNull();
    expect(relogEntry({ unit: 'g', amount: 0 }, after)).toBeNull();
  });
});
