import { parsePrototypeBackup, type PrototypeImport } from '@peakr/engine';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import * as repo from '@/data/repositories/body-repository';

/**
 * Import of a Körper-Tracker backup (the prototype's JSON), so existing data moves into Peakr.
 * Weigh-ins, measurements, body fat, notes and daily kcal come along; photos cannot (they live
 * in the prototype's own storage, the JSON only names them) and are counted for the report.
 * Importing the same file twice adds nothing twice: days that already have the value are skipped.
 */

export interface ImportReport {
  imported: number;
  skipped: number;
  photosNotImported: number;
}

export type ImportOutcome =
  { status: 'cancelled' } | { status: 'invalid' } | { status: 'done'; report: ImportReport };

export async function applyPrototypeImport(
  data: PrototypeImport,
  userId: string | null,
): Promise<ImportReport> {
  const [weighIns, checkIns, days, profile, settings] = await Promise.all([
    repo.listCheckIns(),
    repo.listMeasurements(),
    repo.listDayKcal(),
    repo.getProfile(),
    repo.getCheckInSettings(),
  ]);
  let imported = 0;
  let skipped = data.skipped;

  for (const c of data.checkIns) {
    let used = false;
    if (c.weightKg !== null) {
      if (weighIns.some((w) => w.day === c.day && w.weightKg === c.weightKg)) skipped++;
      else {
        await repo.addCheckIn({
          day: c.day,
          weightKg: c.weightKg,
          waistCm: null,
          bodyFatPct: null,
          note: null,
          source: 'import',
        });
        used = true;
      }
    }
    const hasCheckIn =
      Object.keys(c.measurements).length > 0 || c.bodyFatPct !== null || c.note !== null;
    if (hasCheckIn) {
      if (checkIns.some((m) => m.day === c.day)) skipped++;
      else {
        await repo.saveMeasurement({
          day: c.day,
          values: c.measurements as Record<string, number>,
          bodyFatPct: c.bodyFatPct,
          bodyFatSource: c.bodyFatPct !== null ? 'manual' : null,
          note: c.note,
        });
        used = true;
      }
    }
    if (used) imported++;
  }

  for (const d of data.days) {
    if (days.some((x) => x.day === d.day)) {
      skipped++;
      continue;
    }
    await repo.setDayKcal(d);
    imported++;
  }

  // The shared profile only fills gaps – what Peakr already knows wins.
  const fill = {
    ...(profile.heightCm === undefined && data.profile.heightCm !== undefined
      ? { heightCm: data.profile.heightCm }
      : {}),
    ...(profile.sex === undefined && data.profile.sex !== undefined
      ? { sex: data.profile.sex }
      : {}),
  };
  if (Object.keys(fill).length > 0) await repo.saveProfile(fill, userId);
  if (data.profile.measureWeekday !== undefined || data.profile.weighDaily !== undefined) {
    await repo.saveCheckInSettings({
      ...settings,
      measureWeekday: data.profile.measureWeekday ?? settings.measureWeekday,
      weighDaily: data.profile.weighDaily ?? settings.weighDaily,
    });
  }
  return { imported, skipped, photosNotImported: data.photosNotImported };
}

/** Lets the user pick the backup file and imports it. */
export async function importPrototypeFile(userId: string | null): Promise<ImportOutcome> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  const asset = picked.canceled ? null : picked.assets?.[0];
  if (!asset) return { status: 'cancelled' };
  let json: unknown;
  try {
    json = JSON.parse(await new File(asset.uri).text());
  } catch {
    return { status: 'invalid' };
  }
  const parsed = parsePrototypeBackup(json);
  if (!parsed.ok) return { status: 'invalid' };
  return { status: 'done', report: await applyPrototypeImport(parsed.value, userId) };
}
