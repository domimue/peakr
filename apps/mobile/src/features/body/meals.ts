export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** A meal from a route parameter (anything unknown is a snack). */
export function asMeal(value: string | undefined): Meal {
  return MEALS.includes(value as Meal) ? (value as Meal) : 'snack';
}
