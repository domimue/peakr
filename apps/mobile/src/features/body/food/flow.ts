import type { Meal } from '../meals';

/**
 * The food screens serve two flows: logging to a meal, and adding an ingredient to the recipe
 * being edited. The same search, scanner, manual entry and amount picker are used for both –
 * the mode only changes where the picked amount goes.
 */
export type FoodMode = 'log' | 'ingredient';

export const asFoodMode = (value: string | undefined): FoodMode =>
  value === 'ingredient' ? 'ingredient' : 'log';

/** Route params that carry the flow on to the next food screen. */
export const flowParams = (meal: Meal, day: string, mode: FoodMode) =>
  mode === 'ingredient' ? { meal, day, mode } : { meal, day };
