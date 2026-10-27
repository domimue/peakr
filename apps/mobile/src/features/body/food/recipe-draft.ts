import { scaleRecipe } from '@peakr/engine';
import { create } from 'zustand';

import type { BodyPhoto, StoredRecipeIngredient } from '@/data/db/schema';
import type { FoodItem } from '@/data/repositories/body-repository';

/** An ingredient in the editor: the stored form plus a key for the list. */
export interface DraftIngredient extends StoredRecipeIngredient {
  key: string;
  count: number | null;
}

/** The photo as the editor holds it: the saved one, a newly picked one, or removed. */
export type DraftPhoto =
  | { kind: 'saved'; photo: BodyPhoto | null }
  | { kind: 'picked'; uri: string }
  | { kind: 'removed' };

interface DraftState {
  /** The recipe being edited (null: a new one); `startedFor` tells the editor it is set up. */
  id: string | null;
  startedFor: string | null;
  name: string;
  note: string;
  photo: DraftPhoto;
  ingredients: DraftIngredient[];
  portions: number;
  /** Weight of the cooked dish in grams, if weighed. */
  cookedWeightG: number | null;
  /** Sets the editor up from a saved recipe (or empty); `scale` multiplies it ("cooked double"). */
  start: (base: FoodItem | null, scale?: number) => void;
  set: (
    patch: Partial<Pick<DraftState, 'name' | 'note' | 'photo' | 'portions' | 'cookedWeightG'>>,
  ) => void;
  addIngredient: (i: StoredRecipeIngredient) => void;
  updateIngredient: (key: string, patch: Partial<StoredRecipeIngredient>) => void;
  removeIngredient: (key: string) => void;
  reset: () => void;
}

let seq = 0;
const keyed = (i: StoredRecipeIngredient): DraftIngredient => ({
  ...i,
  count: i.count ?? null,
  key: `ing-${++seq}`,
});

const EMPTY = {
  id: null,
  startedFor: null,
  name: '',
  note: '',
  photo: { kind: 'saved', photo: null } as DraftPhoto,
  ingredients: [] as DraftIngredient[],
  portions: 1,
  cookedWeightG: null,
};

/**
 * The recipe being built. It lives outside the editor screen because adding an ingredient goes
 * through the search, the scanner or the manual entry and comes back – the draft survives that.
 */
export const useRecipeDraft = create<DraftState>()((set) => ({
  ...EMPTY,
  start: (base, scale) => {
    const ingredients = (base?.recipe?.ingredients ?? []).map((i) =>
      keyed({ basis: 'g', unit: i.basis ?? 'g', count: null, portionLabel: null, ...i }),
    );
    const plain = {
      ingredients,
      portions: base?.recipe?.servings ?? 1,
      cookedWeightG: base?.recipe?.totalWeightG ?? null,
    };
    const scaled = scale && scale !== 1 ? scaleRecipe(plain, scale) : plain;
    set({
      ...EMPTY,
      id: base?.id ?? null,
      startedFor: base?.id ?? 'new',
      name: base?.name ?? '',
      note: base?.recipe?.note ?? '',
      photo: { kind: 'saved', photo: base?.recipe?.photo ?? null },
      // Recipes saved before units existed: grams.
      ingredients: [...scaled.ingredients],
      portions: scaled.portions,
      cookedWeightG: scaled.cookedWeightG,
    });
  },
  set: (patch) => set(patch),
  addIngredient: (i) => set((s) => ({ ingredients: [...s.ingredients, keyed(i)] })),
  updateIngredient: (key, patch) =>
    set((s) => ({
      ingredients: s.ingredients.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    })),
  removeIngredient: (key) =>
    set((s) => ({ ingredients: s.ingredients.filter((i) => i.key !== key) })),
  reset: () => set(EMPTY),
}));
