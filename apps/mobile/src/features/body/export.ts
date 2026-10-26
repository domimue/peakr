import type { CheckIn, FoodEntry } from '@/data/repositories/body-repository';
import { shareFile, type ShareResult } from '@/features/sharing/share-file';

/**
 * Export of the add-on data (CLAUDE.md "Add-on rules": a cancelled add-on keeps its data and can
 * export it). One CSV with both record types, so it opens in any spreadsheet.
 */

const cell = (v: string | number | null) => {
  const s = v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function bodyCsv(food: readonly FoodEntry[], checkIns: readonly CheckIn[]): string {
  const rows: (string | number | null)[][] = [
    ['type', 'date', 'meal', 'name', 'kcal', 'protein_g', 'weight_kg', 'waist_cm', 'note'],
    ...food.map((f) => ['food', f.day, f.meal, f.name, f.kcal, f.proteinG, null, null, null]),
    ...checkIns.map((c) => [
      'check-in',
      c.day,
      null,
      null,
      null,
      null,
      c.weightKg,
      c.waistCm,
      c.note,
    ]),
  ];
  return `${rows.map((r) => r.map(cell).join(',')).join('\n')}\n`;
}

/** Export is always allowed for one's own data – also after the add-on ended. */
export async function exportBodyData(today: string): Promise<ShareResult> {
  const repo = await import('@/data/repositories/body-repository');
  const csv = bodyCsv(await repo.listFood(), await repo.listCheckIns());
  return shareFile({
    name: `peakr-body-${today}.csv`,
    mime: 'text/csv',
    uti: 'public.comma-separated-values-text',
    bytes: new TextEncoder().encode(csv),
  });
}
