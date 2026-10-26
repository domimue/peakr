import { describe, expect, it } from 'vitest';

import {
  amountOf,
  fuellingHints,
  isBarcode,
  macroTargets,
  nutrientsFor,
  parseOffProduct,
  parseOffSearch,
  progressOf,
  quickAdd,
  recipeOf,
  sumNutrients,
  type FoodData,
} from '.';

const oats: FoodData = {
  basis: 'g',
  per100: { kcal: 370, proteinG: 13, carbsG: 60, fatG: 7 },
  pieceAmount: null,
  portions: [{ label: '1 cup', amount: 80 }],
};
const egg: FoodData = {
  basis: 'g',
  per100: { kcal: 143, proteinG: 12.6, carbsG: 0.7, fatG: 9.5 },
  pieceAmount: 55,
};

describe('portions', () => {
  it('grams, pieces and product portions all become the basis amount', () => {
    expect(amountOf(oats, { unit: 'base', amount: 50 })).toBe(50);
    expect(amountOf(oats, { unit: 'portion', label: '1 cup', count: 1.5 })).toBe(120);
    expect(amountOf(egg, { unit: 'piece', count: 2 })).toBe(110);
    expect(amountOf(oats, { unit: 'piece', count: 1 })).toBeNull();
    expect(amountOf(oats, { unit: 'portion', label: '1 bowl', count: 1 })).toBeNull();
    expect(amountOf(oats, { unit: 'base', amount: 0 })).toBeNull();
  });

  it('scales nutrients and sums them', () => {
    const a = nutrientsFor(oats.per100, 50);
    expect(a).toEqual({ kcal: 185, proteinG: 6.5, carbsG: 30, fatG: 3.5 });
    expect(sumNutrients([a, nutrientsFor(egg.per100, 110)])).toEqual({
      kcal: 342,
      proteinG: 20.4,
      carbsG: 30.8,
      fatG: 14,
    });
    expect(quickAdd({ kcal: 250.4, proteinG: -3 })).toEqual({
      kcal: 250,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    });
  });
});

describe('recipes', () => {
  it('spreads the ingredients over the weighed finished dish', () => {
    const r = recipeOf({
      ingredients: [
        { per100: { kcal: 350, proteinG: 12, carbsG: 72, fatG: 1.5 }, amount: 200 }, // dry pasta
        { per100: { kcal: 30, proteinG: 1.5, carbsG: 5, fatG: 0.2 }, amount: 400 }, // tomato sauce
      ],
      totalWeightG: 1000,
      servings: 4,
    });
    expect(r).toEqual({
      total: { kcal: 820, proteinG: 30, carbsG: 164, fatG: 3.8 },
      per100: { kcal: 82, proteinG: 3, carbsG: 16.4, fatG: 0.4 },
      totalWeightG: 1000,
      servingG: 250,
    });
  });

  it('without a weighed total the raw weight is used; no ingredients, no recipe', () => {
    expect(recipeOf({ ingredients: [{ per100: oats.per100, amount: 50 }] })?.per100.kcal).toBe(370);
    expect(recipeOf({ ingredients: [] })).toBeNull();
    expect(recipeOf({ ingredients: [{ per100: oats.per100, amount: 0 }] })).toBeNull();
  });
});

describe('targets and rings', () => {
  it('protein from the goal, fat 30 % (at least 0.6 g/kg), carbs the rest', () => {
    expect(macroTargets({ kcal: 2000, proteinG: 130, weightKg: 70 })).toEqual({
      kcal: 2000,
      proteinG: 130,
      fatG: 67,
      carbsG: 220,
    });
    expect(macroTargets({ kcal: 1200, proteinG: 150, weightKg: 90 }).fatG).toBe(54);
    expect(macroTargets({ kcal: 500, proteinG: 150, weightKg: 90 }).carbsG).toBe(0);
  });

  it('ring share caps at 1 and reports the overshoot', () => {
    expect(progressOf(1500, 2000)).toEqual({ share: 0.75, over: 0 });
    expect(progressOf(2300, 2000)).toEqual({ share: 1, over: 300 });
    expect(progressOf(100, 0)).toEqual({ share: 0, over: 0 });
  });
});

describe('Open Food Facts', () => {
  it('reads name, brand, nutrients per 100 and the serving size', () => {
    const food = parseOffProduct(
      {
        status: 1,
        product: {
          product_name: 'Crunchy Muesli',
          brands: 'Brand A, Brand B',
          serving_size: '45 g',
          nutriments: {
            'energy-kcal_100g': 412,
            proteins_100g: 9.1,
            carbohydrates_100g: 63.25,
            fat_100g: '12,5',
          },
        },
      },
      '7612345678901',
    );
    expect(food).toEqual({
      barcode: '7612345678901',
      name: 'Crunchy Muesli',
      brand: 'Brand A',
      basis: 'g',
      per100: { kcal: 412, proteinG: 9.1, carbsG: 63.3, fatG: 12.5 },
      portions: [{ label: '45 g', amount: 45 }],
    });
  });

  it('drinks per 100 ml, energy from kJ when kcal is missing', () => {
    const drink = parseOffProduct(
      {
        status: 1,
        product: {
          product_name_en: 'Orange juice',
          quantity: '1 l',
          serving_quantity: 250,
          serving_size: '250 ml',
          nutriments: { 'energy-kj_100g': 188 },
        },
      },
      '40000000',
    );
    expect(drink).toMatchObject({
      basis: 'ml',
      per100: { kcal: 45, proteinG: 0 },
      portions: [{ amount: 250 }],
    });
    expect(
      parseOffProduct(
        { status: 1, product: { nutrition_data_per: '100ml', nutriments: { energy_100g: 418 } } },
        '1',
      ),
    ).toMatchObject({
      basis: 'ml',
      name: '1',
      per100: { kcal: 100 },
      portions: [],
    });
  });

  it('unknown products and products without energy are not foods', () => {
    expect(parseOffProduct({ status: 0 }, '1')).toBeNull();
    expect(parseOffProduct(null, '1')).toBeNull();
    expect(
      parseOffProduct({ status: 1, product: { product_name: 'X', nutriments: {} } }, '1'),
    ).toBeNull();
    expect(
      parseOffProduct(
        {
          status: 1,
          product: {
            product_name: 'X',
            serving_size: '2 pieces',
            nutriments: { 'energy-kcal_100g': 100 },
          },
        },
        '1',
      )?.portions,
    ).toEqual([]);
  });

  it('search results skip products without a code or energy', () => {
    expect(
      parseOffSearch({
        products: [
          { code: '1', product_name: 'A', nutriments: { 'energy-kcal_100g': 100 } },
          { code: '', product_name: 'B' },
          { code: '3', product_name: 'C', nutriments: {} },
        ],
      }).map((f) => f.name),
    ).toEqual(['A']);
    expect(parseOffSearch({})).toEqual([]);
  });

  it('knows a barcode', () => {
    expect(isBarcode('7612345678901')).toBe(true);
    expect(isBarcode('12345678')).toBe(true);
    expect(isBarcode('oats')).toBe(false);
  });
});

describe('edges', () => {
  it('quick add with carbs and fat; a product without nutriments object or brand', () => {
    expect(quickAdd({ kcal: 100, carbsG: 20, fatG: 2 })).toEqual({
      kcal: 100,
      proteinG: 0,
      carbsG: 20,
      fatG: 2,
    });
    expect(
      parseOffProduct({ status: 1, product: { product_name: 'Y', brands: ' ' } }, '1'),
    ).toBeNull();
    expect(
      parseOffProduct(
        {
          status: 1,
          product: {
            product_name: 'Y',
            brands: ' ',
            serving_quantity: 30,
            nutriments: { 'energy-kcal_100g': 50 },
          },
        },
        '1',
      ),
    ).toMatchObject({ brand: null, portions: [{ label: '30 g', amount: 30 }] });
  });
});

describe('fuelling hints', () => {
  it('long endurance sessions get before/after hints, from 2 h also carbs during', () => {
    const hints = fuellingHints([
      { date: '2026-10-31', sport: 'bike', durationMin: 150 },
      { date: '2026-10-29', sport: 'run', durationMin: 95 },
      { date: '2026-10-28', sport: 'run', durationMin: 45 },
      { date: '2026-10-27', sport: 'strength', durationMin: 120 },
    ]);
    expect(hints).toEqual([
      {
        date: '2026-10-31',
        sport: 'bike',
        durationMin: 150,
        hints: ['before', 'during', 'after'],
        duringCarbsPerHour: { min: 30, max: 60 },
      },
      {
        date: '2026-10-29',
        sport: 'run',
        durationMin: 95,
        hints: ['before', 'after'],
        duringCarbsPerHour: null,
      },
    ]);
  });
});
