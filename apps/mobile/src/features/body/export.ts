import { MEASUREMENTS } from '@peakr/engine';

import * as repo from '@/data/repositories/body-repository';
import type { CheckIn, DayKcal, FoodEntry, Measurement } from '@/data/repositories/body-repository';
import { PHOTO_SLOTS } from '@/data/body-photos';
import { shareFile, type ShareResult } from '@/features/sharing/share-file';

/**
 * Export of the add-on data (CLAUDE.md "Add-on rules": a cancelled add-on keeps its data and can
 * export it). CSV with every record type in one sheet, so it opens in any spreadsheet, or the
 * complete Peakr JSON. Photos stay private: the export names which slots had one, never a link.
 */

export interface BodyExportData {
  food: readonly FoodEntry[];
  weighIns: readonly CheckIn[];
  checkIns?: readonly Measurement[];
  dayKcal?: readonly DayKcal[];
}

const cell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const photoSlots = (m: Measurement) =>
  PHOTO_SLOTS.filter((s) => m.photos[s] && !m.photos[s]?.removed).join(' ');

const KEYS = MEASUREMENTS.map((m) => m.key);
const HEADER = [
  'type',
  'date',
  'meal',
  'name',
  'amount',
  'unit',
  'kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'active_kcal',
  'weight_kg',
  'body_fat_pct',
  'body_fat_source',
  ...KEYS.map((k) => `${k}_cm`),
  'photos',
  'note',
];

type Cells = Partial<Record<(typeof HEADER)[number], string | number | null>>;
const row = (c: Cells) => HEADER.map((h) => cell(c[h]));

export function bodyCsv(data: BodyExportData): string {
  const rows = [
    HEADER,
    ...data.food.map((f) =>
      row({
        type: 'food',
        date: f.day,
        meal: f.meal,
        name: f.name,
        amount: f.amount,
        unit: f.unit === 'portion' ? f.portionLabel : f.unit,
        kcal: f.kcal,
        protein_g: f.proteinG,
        carbs_g: f.carbsG,
        fat_g: f.fatG,
      }),
    ),
    ...(data.dayKcal ?? []).map((d) =>
      row({ type: 'day', date: d.day, kcal: d.intakeKcal, active_kcal: d.activeKcal }),
    ),
    ...data.weighIns.map((c) =>
      row({
        type: 'weigh-in',
        date: c.day,
        weight_kg: c.weightKg,
        body_fat_pct: c.bodyFatPct,
        body_fat_source: c.bodyFatPct !== null ? 'manual' : null,
        waist_cm: c.waistCm,
        note: c.note,
      }),
    ),
    ...(data.checkIns ?? []).map((m) =>
      row({
        type: 'check-in',
        date: m.day,
        body_fat_pct: m.bodyFatPct,
        body_fat_source: m.bodyFatSource,
        ...Object.fromEntries(KEYS.map((k) => [`${k}_cm`, m.values[k] ?? null])),
        photos: photoSlots(m),
        note: m.note,
      }),
    ),
  ];
  return `${rows.map((r) => r.join(',')).join('\n')}\n`;
}

/** The complete Body data as Peakr JSON (`format: peakr-body`). */
export function bodyJson(
  data: Required<BodyExportData>,
  extra: { exportedAt: string; profile: object; settings: object },
): string {
  return JSON.stringify(
    {
      format: 'peakr-body',
      version: 1,
      exportedAt: extra.exportedAt,
      profile: extra.profile,
      checkInSettings: extra.settings,
      weighIns: data.weighIns.map((c) => ({
        date: c.day,
        weightKg: c.weightKg,
        bodyFatPct: c.bodyFatPct,
        note: c.note,
      })),
      checkIns: data.checkIns.map((m) => ({
        date: m.day,
        measurementsCm: m.values,
        bodyFatPct: m.bodyFatPct,
        bodyFatSource: m.bodyFatSource,
        note: m.note,
        photos: photoSlots(m) ? photoSlots(m).split(' ') : [],
      })),
      days: data.dayKcal.map((d) => ({
        date: d.day,
        intakeKcal: d.intakeKcal,
        activeKcal: d.activeKcal,
      })),
      food: data.food.map(({ id: _id, createdAt: _c, day, ...f }) => ({ date: day, ...f })),
    },
    null,
    2,
  );
}

/** Export is always allowed for one's own data – also after the add-on ended. */
export async function exportBodyData(today: string, format: 'csv' | 'json'): Promise<ShareResult> {
  const [food, weighIns, checkIns, dayKcal] = await Promise.all([
    repo.listFood(),
    repo.listCheckIns(),
    repo.listMeasurements(),
    repo.listDayKcal(),
  ]);
  const data = { food, weighIns, checkIns, dayKcal };
  if (format === 'csv') {
    return shareFile({
      name: `peakr-body-${today}.csv`,
      mime: 'text/csv',
      uti: 'public.comma-separated-values-text',
      bytes: new TextEncoder().encode(bodyCsv(data)),
    });
  }
  const [profile, settings] = await Promise.all([repo.getProfile(), repo.getCheckInSettings()]);
  return shareFile({
    name: `peakr-body-${today}.json`,
    mime: 'application/json',
    uti: 'public.json',
    bytes: new TextEncoder().encode(
      bodyJson(data, { exportedAt: new Date().toISOString(), profile, settings }),
    ),
  });
}
