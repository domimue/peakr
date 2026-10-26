import type { FoodEntry } from '@/data/repositories/body-repository';
import { health } from '@/features/health/health';

/**
 * The diary in the phone's health store, where the user allowed it: each entry is one record
 * keyed on its id (writing again replaces it, deleting removes it), and Peakr's own records are
 * never read back as intake – so there are no duplicates when both sources exist.
 */
export async function syncEntryToHealth(entry: FoodEntry): Promise<void> {
  await health
    .writeNutrition({
      entryId: entry.id,
      day: entry.day,
      meal: entry.meal,
      name: entry.name,
      kcal: entry.kcal,
      proteinG: entry.proteinG,
      carbsG: entry.carbsG,
      fatG: entry.fatG,
    })
    .catch(() => false);
}

export async function removeEntryFromHealth(entryId: string): Promise<void> {
  await health.deleteNutrition(entryId).catch(() => undefined);
}
