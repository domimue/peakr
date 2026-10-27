import type { Nutrients } from '@peakr/engine';
import type { TFunction } from 'i18next';

import type { StoredRecipeIngredient } from '@/data/db/schema';

const num = (n: number) => String(Math.round(n * 100) / 100);

/** "400 g", "250 ml", "3 pieces · 180 g", "½ × 1 box · 300 g", "1 portion · 300 g". */
export function ingredientText(t: TFunction, i: StoredRecipeIngredient): string {
  const basis = i.basis ?? 'g';
  const base = `${num(i.amount)} ${basis}`;
  if (i.unit === 'piece' && i.count) {
    return `${t('bodyAddon.food.pieces', { count: i.count })} · ${base}`;
  }
  if (i.unit === 'portion' && i.count) {
    const label = i.portionLabel ?? t('bodyAddon.recipes.portion');
    return `${t('bodyAddon.food.portionCount', { count: num(i.count), label })} · ${base}`;
  }
  return base;
}

/** "410 kcal · P 15 g · C 82 g · F 1.9 g". */
export const nutrientsText = (t: TFunction, n: Nutrients) =>
  `${t('bodyAddon.kcal', { kcal: n.kcal })} · ${t('bodyAddon.diary.macros', {
    p: n.proteinG,
    c: n.carbsG,
    f: n.fatG,
  })}`;
