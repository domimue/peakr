import type { BodyProfile } from '@peakr/engine';
import type { SupabaseClient } from '@supabase/supabase-js';
import { and, asc, desc, eq, gte, isNotNull, like, or } from 'drizzle-orm';

import { db } from '../db/client';
import {
  appSettings,
  bodyCheckins,
  bodyDays,
  bodyDeviceDaily,
  bodyFoodEntries,
  bodyFoods,
  bodyGoals,
  bodyMeasurements,
  bodyTargetChanges,
  bodyTdeeEstimates,
} from '../db/schema';
import {
  keepLocalCopy,
  PHOTO_SLOTS,
  removeLocalCopy,
  removeRemotePhotos,
  remotePath,
  uploadPhoto,
  type PhotoSlot,
} from '../body-photos';
import type { BodyPhoto } from '../db/schema';
import { newId } from '../ids';
import { supabase } from '../supabase';
import { parseCheckInSettings, type CheckInSettings } from '../../features/body/check-in-settings';
import type { Meal } from '../../features/body/meals';

/**
 * Body add-on data on this device: food diary, check-ins and the shared profile values (sex,
 * birth date, height, weight). The profile values are the account's `profiles` columns – one
 * profile for training and Body, never a second copy in the add-on. Tests replace this file with
 * the in-memory version in `__mocks__`.
 *
 * The guard (`useEntitlement('body_nutrition')`) decides what may be written; this file only
 * stores. The server checks the entitlement again on every write (RLS).
 */

export type { Meal } from '../../features/body/meals';

export interface FoodEntry {
  id: string;
  day: string;
  meal: Meal;
  name: string;
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  /** The food it came from; null for a quick add. */
  foodId: string | null;
  amount: number | null;
  unit: 'g' | 'ml' | 'piece' | 'portion' | null;
  portionLabel: string | null;
  createdAt: string;
}

export interface CheckIn {
  id: string;
  day: string;
  weightKg: number;
  waistCm: number | null;
  bodyFatPct: number | null;
  note: string | null;
  /** `import`: came from a Körper-Tracker backup. */
  source?: 'manual' | 'import';
  createdAt: string;
}

/** A body check-in: measurements, body fat, photos and a note for one day (Phase 15). */
export interface Measurement {
  id: string;
  day: string;
  /** Circumferences in cm, keyed like the engine's `MEASUREMENTS`. */
  values: Record<string, number>;
  bodyFatPct: number | null;
  bodyFatSource: 'manual' | 'navy' | 'scale' | null;
  note: string | null;
  photos: Partial<Record<PhotoSlot, BodyPhoto>>;
  createdAt: string;
}

/** `photos` holds picked image uris for new or replaced slots, null to remove a slot. */
export type MeasurementDraft = Omit<Measurement, 'id' | 'createdAt' | 'photos'> & {
  id?: string;
  photos?: Partial<Record<PhotoSlot, string | null>>;
};

/** Daily kcal quick entry for people who do not log food (Phase 15). */
export interface DayKcal {
  day: string;
  intakeKcal: number | null;
  activeKcal: number | null;
}

type EntryDetails = 'carbsG' | 'fatG' | 'foodId' | 'amount' | 'unit' | 'portionLabel';
export type FoodDraft = Omit<FoodEntry, 'id' | 'createdAt' | EntryDetails> &
  Partial<Pick<FoodEntry, EntryDetails>>;
export type CheckInDraft = Omit<CheckIn, 'id' | 'createdAt'>;

// ---------------------------------------------------------------------------------------------
// Shared profile

const PROFILE_KEY = 'profile.body';

export async function getProfile(): Promise<Partial<BodyProfile>> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, PROFILE_KEY) });
  if (!row) return {};
  try {
    return JSON.parse(row.value) as Partial<BodyProfile>;
  } catch {
    return {};
  }
}

/** Saves on the device and, signed in, on the account (`profiles`); the account is best effort. */
export async function saveProfile(
  values: Partial<BodyProfile>,
  userId: string | null,
): Promise<Partial<BodyProfile>> {
  const next = { ...(await getProfile()), ...values };
  const value = JSON.stringify(next);
  await db
    .insert(appSettings)
    .values({ key: PROFILE_KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
  if (supabase && userId) {
    const { error } = await supabase
      .from('profiles')
      .update({
        sex: next.sex ?? null,
        birth_date: next.birthDate ?? null,
        height_cm: next.heightCm ?? null,
        weight_kg: next.weightKg ?? null,
      })
      .eq('id', userId);
    if (error) console.warn('Profile upload failed', error.message);
  }
  return next;
}

/** The account's values (another device filled them), for a device that has none yet. */
export async function fetchRemoteProfile(userId: string | null): Promise<Partial<BodyProfile>> {
  if (!supabase || !userId) return {};
  const { data, error } = await supabase
    .from('profiles')
    .select('sex, birth_date, height_cm, weight_kg')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return {};
  const r = data as {
    sex: BodyProfile['sex'] | null;
    birth_date: string | null;
    height_cm: number | null;
    weight_kg: number | null;
  };
  return {
    ...(r.sex ? { sex: r.sex } : {}),
    ...(r.birth_date ? { birthDate: r.birth_date } : {}),
    ...(r.height_cm !== null ? { heightCm: Number(r.height_cm) } : {}),
    ...(r.weight_kg !== null ? { weightKg: Number(r.weight_kg) } : {}),
  };
}

const CHECKIN_SETTINGS_KEY = 'body.checkin';

export async function getCheckInSettings(): Promise<CheckInSettings> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, CHECKIN_SETTINGS_KEY),
  });
  try {
    return parseCheckInSettings(row ? JSON.parse(row.value) : null);
  } catch {
    return parseCheckInSettings(null);
  }
}

export async function saveCheckInSettings(settings: CheckInSettings): Promise<void> {
  const value = JSON.stringify(settings);
  await db
    .insert(appSettings)
    .values({ key: CHECKIN_SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

// ---------------------------------------------------------------------------------------------
// Diary and check-ins

const now = () => new Date().toISOString();

const toEntry = (r: typeof bodyFoodEntries.$inferSelect): FoodEntry => ({
  id: r.id,
  day: r.day,
  meal: r.meal,
  name: r.name,
  kcal: r.kcal,
  proteinG: r.proteinG,
  carbsG: r.carbsG,
  fatG: r.fatG,
  foodId: r.foodId,
  amount: r.amount,
  unit: r.unit,
  portionLabel: r.portionLabel,
  createdAt: r.createdAt,
});

const toCheckIn = (r: typeof bodyCheckins.$inferSelect): CheckIn => ({
  id: r.id,
  day: r.day,
  weightKg: r.weightKg,
  waistCm: r.waistCm,
  bodyFatPct: r.bodyFatPct,
  note: r.note,
  source: r.source,
  createdAt: r.createdAt,
});

/** Food entries of one day, or of every day (export). */
export async function listFood(day?: string): Promise<FoodEntry[]> {
  const rows = await db
    .select()
    .from(bodyFoodEntries)
    .where(
      day
        ? and(eq(bodyFoodEntries.day, day), eq(bodyFoodEntries.deleted, false))
        : eq(bodyFoodEntries.deleted, false),
    )
    .orderBy(asc(bodyFoodEntries.day), asc(bodyFoodEntries.createdAt));
  return rows.map(toEntry);
}

export async function addFood(draft: FoodDraft): Promise<FoodEntry> {
  const at = now();
  const row = {
    carbsG: null,
    fatG: null,
    foodId: null,
    amount: null,
    unit: null,
    portionLabel: null,
    ...draft,
    id: newId(),
    createdAt: at,
    updatedAt: at,
    dirty: true,
    deleted: false,
  };
  await db.insert(bodyFoodEntries).values(row);
  if (row.foodId) await touchFoodItem(row.foodId);
  return toEntry(row);
}

/** Copies a day's entries (or one meal of it) to another day, optionally into another meal. */
export async function copyEntries(input: {
  fromDay: string;
  toDay: string;
  meal?: Meal;
  toMeal?: Meal;
}): Promise<FoodEntry[]> {
  const source = (await listFood(input.fromDay)).filter(
    (e) => !input.meal || e.meal === input.meal,
  );
  const copies: FoodEntry[] = [];
  for (const { id: _id, createdAt: _at, day: _day, ...entry } of source) {
    copies.push(await addFood({ ...entry, day: input.toDay, meal: input.toMeal ?? entry.meal }));
  }
  return copies;
}

// ---------------------------------------------------------------------------------------------
// Foods: Open Food Facts cache, own foods, recipes

type FoodRow = typeof bodyFoods.$inferSelect;
export type FoodItem = Omit<FoodRow, 'dirty' | 'deleted' | 'updatedAt'>;
export type FoodItemDraft = Omit<FoodItem, 'id' | 'createdAt' | 'lastUsedAt' | 'favourite'> &
  Partial<Pick<FoodItem, 'id' | 'favourite'>>;

const toItem = ({ dirty: _d, deleted: _x, updatedAt: _u, ...r }: FoodRow): FoodItem => r;
const live = eq(bodyFoods.deleted, false);

export async function getFoodItem(id: string): Promise<FoodItem | null> {
  const [row] = await db
    .select()
    .from(bodyFoods)
    .where(and(eq(bodyFoods.id, id), live));
  return row ? toItem(row) : null;
}

/** The food for a barcode: the user's own (corrected) entry first, then the OFF cache. */
export async function foodByBarcode(barcode: string): Promise<FoodItem | null> {
  const rows = await db
    .select()
    .from(bodyFoods)
    .where(and(eq(bodyFoods.barcode, barcode), live));
  const row = rows.find((r) => r.kind !== 'off') ?? rows[0];
  return row ? toItem(row) : null;
}

/** Local search by name or brand (works offline); OFF results join when online. */
export async function searchFoodItems(query: string, limit = 30): Promise<FoodItem[]> {
  const q = `%${query.trim()}%`;
  const rows = await db
    .select()
    .from(bodyFoods)
    .where(and(live, or(like(bodyFoods.name, q), like(bodyFoods.brand, q))))
    .orderBy(desc(bodyFoods.lastUsedAt))
    .limit(limit);
  return rows.map(toItem);
}

export async function recentFoodItems(limit = 20): Promise<FoodItem[]> {
  const rows = await db
    .select()
    .from(bodyFoods)
    .where(and(live, isNotNull(bodyFoods.lastUsedAt)))
    .orderBy(desc(bodyFoods.lastUsedAt))
    .limit(limit);
  return rows.map(toItem);
}

export async function listFoodItems(
  filter: 'favourites' | 'custom' | 'recipes',
): Promise<FoodItem[]> {
  const where =
    filter === 'favourites'
      ? eq(bodyFoods.favourite, true)
      : eq(bodyFoods.kind, filter === 'custom' ? 'custom' : 'recipe');
  const rows = await db
    .select()
    .from(bodyFoods)
    .where(and(live, where))
    .orderBy(asc(bodyFoods.name));
  return rows.map(toItem);
}

/** Creates or replaces a food (an OFF product cached, an own food, a recipe, a correction). */
export async function saveFoodItem(draft: FoodItemDraft): Promise<FoodItem> {
  const at = now();
  const existing = draft.id ? await getFoodItem(draft.id) : null;
  const row = {
    ...draft,
    id: draft.id ?? newId(),
    favourite: draft.favourite ?? existing?.favourite ?? false,
    lastUsedAt: existing?.lastUsedAt ?? null,
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
    dirty: true,
    deleted: false,
  };
  await db.insert(bodyFoods).values(row).onConflictDoUpdate({ target: bodyFoods.id, set: row });
  return toItem(row);
}

export async function setFavourite(id: string, favourite: boolean): Promise<void> {
  await db
    .update(bodyFoods)
    .set({ favourite, updatedAt: now(), dirty: true })
    .where(eq(bodyFoods.id, id));
}

async function touchFoodItem(id: string): Promise<void> {
  const at = now();
  await db
    .update(bodyFoods)
    .set({ lastUsedAt: at, updatedAt: at, dirty: true })
    .where(eq(bodyFoods.id, id));
}

export async function deleteFoodItem(id: string): Promise<void> {
  await db
    .update(bodyFoods)
    .set({ deleted: true, updatedAt: now(), dirty: true })
    .where(eq(bodyFoods.id, id));
}

export async function deleteFood(id: string): Promise<void> {
  await db
    .update(bodyFoodEntries)
    .set({ deleted: true, dirty: true, updatedAt: now() })
    .where(eq(bodyFoodEntries.id, id));
}

/** All check-ins, oldest first. */
export async function listCheckIns(): Promise<CheckIn[]> {
  const rows = await db
    .select()
    .from(bodyCheckins)
    .where(eq(bodyCheckins.deleted, false))
    .orderBy(asc(bodyCheckins.day), asc(bodyCheckins.createdAt));
  return rows.map(toCheckIn);
}

export async function addCheckIn(draft: CheckInDraft): Promise<CheckIn> {
  const at = now();
  const row = {
    source: 'manual' as const,
    ...draft,
    id: newId(),
    createdAt: at,
    updatedAt: at,
    dirty: true,
    deleted: false,
  };
  await db.insert(bodyCheckins).values(row);
  return toCheckIn(row);
}

export async function updateCheckIn(
  id: string,
  patch: Partial<Pick<CheckIn, 'day' | 'weightKg' | 'bodyFatPct' | 'note'>>,
): Promise<void> {
  await db
    .update(bodyCheckins)
    .set({ ...patch, updatedAt: now(), dirty: true })
    .where(eq(bodyCheckins.id, id));
}

// ---------------------------------------------------------------------------------------------
// Body check-ins: measurements, body fat, photos, note

const toMeasurement = (r: typeof bodyMeasurements.$inferSelect): Measurement => ({
  id: r.id,
  day: r.day,
  values: r.values,
  bodyFatPct: r.bodyFatPct,
  bodyFatSource: r.bodyFatSource,
  note: r.note,
  photos: r.photos,
  createdAt: r.createdAt,
});

/** All check-ins, oldest first. */
export async function listMeasurements(): Promise<Measurement[]> {
  const rows = await db
    .select()
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.deleted, false))
    .orderBy(asc(bodyMeasurements.day), asc(bodyMeasurements.createdAt));
  return rows.map(toMeasurement);
}

export async function getMeasurement(id: string): Promise<Measurement | null> {
  const [row] = await db
    .select()
    .from(bodyMeasurements)
    .where(and(eq(bodyMeasurements.id, id), eq(bodyMeasurements.deleted, false)));
  return row ? toMeasurement(row) : null;
}

/**
 * Creates or replaces a check-in. New photos are copied into Peakr's folder right away (offline
 * first) and uploaded by the next sync; a replaced or removed photo's local copy is deleted, its
 * upload is replaced (same path) or removed by the sync.
 */
export async function saveMeasurement(draft: MeasurementDraft): Promise<Measurement> {
  const at = now();
  const existing = draft.id ? await getMeasurement(draft.id) : null;
  const id = draft.id ?? newId();
  const photos: Partial<Record<PhotoSlot, BodyPhoto>> = { ...(existing?.photos ?? {}) };
  for (const slot of PHOTO_SLOTS) {
    const picked = draft.photos?.[slot];
    if (picked === undefined) continue;
    const old = photos[slot];
    if (picked === null) {
      removeLocalCopy(old?.localUri ?? null);
      // Keep the path with no local file so the sync removes the upload, then drops the slot.
      if (old?.remotePath)
        photos[slot] = { localUri: null, remotePath: old.remotePath, removed: true };
      else delete photos[slot];
    } else if (picked !== old?.localUri) {
      removeLocalCopy(old?.localUri ?? null);
      photos[slot] = { localUri: keepLocalCopy(picked, id, slot), remotePath: null };
    }
  }
  const row = {
    id,
    day: draft.day,
    values: draft.values,
    bodyFatPct: draft.bodyFatPct,
    bodyFatSource: draft.bodyFatPct === null ? null : draft.bodyFatSource,
    note: draft.note,
    photos,
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
    dirty: true,
    deleted: false,
  };
  await db
    .insert(bodyMeasurements)
    .values(row)
    .onConflictDoUpdate({ target: bodyMeasurements.id, set: row });
  return toMeasurement(row);
}

/** Deletes a check-in; its photos go from this device now and from the bucket with the sync. */
export async function deleteMeasurement(id: string): Promise<void> {
  const existing = await getMeasurement(id);
  for (const p of Object.values(existing?.photos ?? {})) removeLocalCopy(p?.localUri ?? null);
  await db
    .update(bodyMeasurements)
    .set({ deleted: true, dirty: true, updatedAt: now() })
    .where(eq(bodyMeasurements.id, id));
}

export async function deleteCheckIn(id: string): Promise<void> {
  await db
    .update(bodyCheckins)
    .set({ deleted: true, dirty: true, updatedAt: now() })
    .where(eq(bodyCheckins.id, id));
}

// ---------------------------------------------------------------------------------------------
// Day markers, TDEE estimates, target changes

/** Days the user marked as incomplete. */
export async function listIncompleteDays(): Promise<string[]> {
  const rows = await db.select().from(bodyDays).where(eq(bodyDays.incomplete, true));
  return rows.map((r) => r.day);
}

export async function setDayIncomplete(day: string, incomplete: boolean): Promise<void> {
  const row = { day, incomplete, updatedAt: now(), dirty: true };
  await db.insert(bodyDays).values(row).onConflictDoUpdate({ target: bodyDays.day, set: row });
}

/** Days with a quick kcal entry, oldest first. */
export async function listDayKcal(): Promise<DayKcal[]> {
  const rows = await db
    .select()
    .from(bodyDays)
    .where(or(isNotNull(bodyDays.intakeKcal), isNotNull(bodyDays.activeKcal)))
    .orderBy(asc(bodyDays.day));
  return rows.map((r) => ({ day: r.day, intakeKcal: r.intakeKcal, activeKcal: r.activeKcal }));
}

export async function setDayKcal(entry: DayKcal): Promise<void> {
  const set = {
    intakeKcal: entry.intakeKcal,
    activeKcal: entry.activeKcal,
    updatedAt: now(),
    dirty: true,
  };
  await db
    .insert(bodyDays)
    .values({ day: entry.day, incomplete: false, ...set })
    .onConflictDoUpdate({ target: bodyDays.day, set });
}

export interface StoredTdeeEstimate {
  date: string;
  tdeeKcal: number;
  rawKcal: number;
  formulaKcal: number;
  correctionKcal: number;
  clamped: boolean;
  basis: Record<string, unknown>;
}

export async function listTdeeEstimates(): Promise<StoredTdeeEstimate[]> {
  const rows = await db.select().from(bodyTdeeEstimates).orderBy(asc(bodyTdeeEstimates.date));
  return rows.map(({ dirty: _dirty, ...r }) => r);
}

export async function saveTdeeEstimate(e: StoredTdeeEstimate): Promise<void> {
  const row = { ...e, dirty: true };
  await db
    .insert(bodyTdeeEstimates)
    .values(row)
    .onConflictDoUpdate({ target: bodyTdeeEstimates.date, set: row });
}

export interface StoredTargetChange {
  date: string;
  intakeKcal: number;
  reason: 'user' | 'adaptive' | 'safety_clamp';
}

export async function listTargetChanges(): Promise<StoredTargetChange[]> {
  const rows = await db.select().from(bodyTargetChanges).orderBy(asc(bodyTargetChanges.date));
  return rows.map(({ dirty: _dirty, ...r }) => r);
}

export async function saveTargetChange(c: StoredTargetChange): Promise<void> {
  const row = { ...c, dirty: true };
  await db
    .insert(bodyTargetChanges)
    .values(row)
    .onConflictDoUpdate({ target: bodyTargetChanges.date, set: row });
}

// ---------------------------------------------------------------------------------------------
// Weight goal (every version kept)

export interface StoredGoal {
  id: string;
  createdAt: string;
  kind: 'lose' | 'maintain' | 'gain';
  startWeightKg: number;
  targetWeightKg: number | null;
  ratePerWeekKg: number;
  eatBackPct: number;
  weeklyMode: boolean;
  adjustmentKcal: number;
  paused: boolean;
  reason: 'user' | 'adaptive' | 'safety_clamp';
}

export type GoalDraft = Omit<StoredGoal, 'id' | 'createdAt'>;

/** All versions, oldest first; the last one is the current goal. */
export async function listGoals(): Promise<StoredGoal[]> {
  const rows = await db.select().from(bodyGoals).orderBy(asc(bodyGoals.createdAt));
  return rows.map(({ dirty: _dirty, ...r }) => r);
}

export async function saveGoal(draft: GoalDraft): Promise<StoredGoal> {
  const goal = { ...draft, id: newId(), createdAt: now() };
  await db.insert(bodyGoals).values({ ...goal, dirty: true });
  return goal;
}

// ---------------------------------------------------------------------------------------------
// Health store values (device only, never uploaded)

export type DeviceBodyMetric = typeof bodyDeviceDaily.$inferSelect.metric;
export type DeviceBodyValue = typeof bodyDeviceDaily.$inferSelect;

export async function saveDeviceValues(rows: readonly DeviceBodyValue[]): Promise<void> {
  for (const row of rows) {
    await db
      .insert(bodyDeviceDaily)
      .values(row)
      .onConflictDoUpdate({
        target: [bodyDeviceDaily.metric, bodyDeviceDaily.day, bodyDeviceDaily.source],
        set: { value: row.value, recordedAt: row.recordedAt },
      });
  }
}

export async function listDeviceValues(fromDay: string): Promise<DeviceBodyValue[]> {
  return db.select().from(bodyDeviceDaily).where(gte(bodyDeviceDaily.day, fromDay));
}

/** Removes the values of metrics the user no longer allows (or all of them). */
export async function deleteDeviceValues(metrics?: readonly DeviceBodyMetric[]): Promise<void> {
  if (!metrics) {
    await db.delete(bodyDeviceDaily);
    return;
  }
  for (const metric of metrics)
    await db.delete(bodyDeviceDaily).where(eq(bodyDeviceDaily.metric, metric));
}

// ---------------------------------------------------------------------------------------------
// Sync (called from `syncOnce`): push what changed here, pull what another device wrote.

type Row = Record<string, unknown>;

/** How one local table maps to its server table. */
interface SyncSpec {
  server: string;
  /** Server conflict key (besides the user for per-user keys). */
  onConflict: string;
  dirty: () => Promise<Row[]>;
  /** Server row for a local one (without `user_id`); null = delete on the server. */
  toServer: (r: Row) => Row | null;
  /** Server primary key filter for a delete. */
  key: (r: Row) => Record<string, string>;
  markPushed: (r: Row) => Promise<void>;
  /** Writes a server row unless this device changed it since; returns whether it wrote. */
  apply: (r: Row) => Promise<boolean>;
}

const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

async function isDirty(
  table: typeof bodyFoodEntries | typeof bodyCheckins,
  id: string,
): Promise<boolean> {
  const [existing] = await db.select().from(table).where(eq(table.id, id));
  return Boolean(existing?.dirty);
}

const SPECS: SyncSpec[] = [
  {
    server: 'body_food_entries',
    onConflict: 'id',
    dirty: () => db.select().from(bodyFoodEntries).where(eq(bodyFoodEntries.dirty, true)),
    toServer: (r) =>
      r.deleted
        ? null
        : {
            id: r.id,
            day: r.day,
            meal: r.meal,
            name: r.name,
            kcal: r.kcal,
            protein_g: r.proteinG,
            carbs_g: r.carbsG,
            fat_g: r.fatG,
            food_id: r.foodId,
            amount: r.amount,
            unit: r.unit,
            portion_label: r.portionLabel,
            created_at: r.createdAt,
            updated_at: r.updatedAt,
          },
    key: (r) => ({ id: String(r.id) }),
    markPushed: async (r) => {
      if (r.deleted) await db.delete(bodyFoodEntries).where(eq(bodyFoodEntries.id, String(r.id)));
      else
        await db
          .update(bodyFoodEntries)
          .set({ dirty: false })
          .where(eq(bodyFoodEntries.id, String(r.id)));
    },
    apply: async (r) => {
      const id = String(r.id);
      if (await isDirty(bodyFoodEntries, id)) return false;
      const row = {
        id,
        day: String(r.day),
        meal: r.meal as Meal,
        name: String(r.name),
        kcal: Number(r.kcal),
        proteinG: numOrNull(r.protein_g),
        carbsG: numOrNull(r.carbs_g),
        fatG: numOrNull(r.fat_g),
        foodId: str(r.food_id),
        amount: numOrNull(r.amount),
        unit: str(r.unit) as FoodEntry['unit'],
        portionLabel: str(r.portion_label),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
        dirty: false,
        deleted: false,
      };
      await db
        .insert(bodyFoodEntries)
        .values(row)
        .onConflictDoUpdate({ target: bodyFoodEntries.id, set: row });
      return true;
    },
  },
  {
    server: 'body_checkins',
    onConflict: 'id',
    dirty: () => db.select().from(bodyCheckins).where(eq(bodyCheckins.dirty, true)),
    toServer: (r) =>
      r.deleted
        ? null
        : {
            id: r.id,
            day: r.day,
            weight_kg: r.weightKg,
            waist_cm: r.waistCm,
            body_fat_pct: r.bodyFatPct,
            note: r.note,
            source: r.source,
            created_at: r.createdAt,
            updated_at: r.updatedAt,
          },
    key: (r) => ({ id: String(r.id) }),
    markPushed: async (r) => {
      if (r.deleted) await db.delete(bodyCheckins).where(eq(bodyCheckins.id, String(r.id)));
      else
        await db
          .update(bodyCheckins)
          .set({ dirty: false })
          .where(eq(bodyCheckins.id, String(r.id)));
    },
    apply: async (r) => {
      const id = String(r.id);
      if (await isDirty(bodyCheckins, id)) return false;
      const row = {
        id,
        day: String(r.day),
        weightKg: Number(r.weight_kg),
        waistCm: numOrNull(r.waist_cm),
        bodyFatPct: numOrNull(r.body_fat_pct),
        note: str(r.note),
        source: r.source === 'import' ? ('import' as const) : ('manual' as const),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
        dirty: false,
        deleted: false,
      };
      await db
        .insert(bodyCheckins)
        .values(row)
        .onConflictDoUpdate({ target: bodyCheckins.id, set: row });
      return true;
    },
  },
  {
    server: 'body_days',
    onConflict: 'user_id,day',
    dirty: () => db.select().from(bodyDays).where(eq(bodyDays.dirty, true)),
    toServer: (r) => ({
      day: r.day,
      incomplete: r.incomplete,
      intake_kcal: r.intakeKcal,
      active_kcal: r.activeKcal,
      updated_at: r.updatedAt,
    }),
    key: (r) => ({ day: String(r.day) }),
    markPushed: async (r) => {
      await db
        .update(bodyDays)
        .set({ dirty: false })
        .where(eq(bodyDays.day, String(r.day)));
    },
    apply: async (r) => {
      const day = String(r.day);
      const [existing] = await db.select().from(bodyDays).where(eq(bodyDays.day, day));
      if (existing?.dirty) return false;
      const row = {
        day,
        incomplete: Boolean(r.incomplete),
        intakeKcal: numOrNull(r.intake_kcal),
        activeKcal: numOrNull(r.active_kcal),
        updatedAt: String(r.updated_at),
        dirty: false,
      };
      await db.insert(bodyDays).values(row).onConflictDoUpdate({ target: bodyDays.day, set: row });
      return true;
    },
  },
  {
    server: 'body_tdee_estimates',
    onConflict: 'user_id,date',
    dirty: () => db.select().from(bodyTdeeEstimates).where(eq(bodyTdeeEstimates.dirty, true)),
    toServer: (r) => ({
      date: r.date,
      tdee_kcal: r.tdeeKcal,
      raw_kcal: r.rawKcal,
      formula_kcal: r.formulaKcal,
      correction_kcal: r.correctionKcal,
      clamped: r.clamped,
      basis: r.basis,
    }),
    key: (r) => ({ date: String(r.date) }),
    markPushed: async (r) => {
      await db
        .update(bodyTdeeEstimates)
        .set({ dirty: false })
        .where(eq(bodyTdeeEstimates.date, String(r.date)));
    },
    apply: async (r) => {
      const date = String(r.date);
      const [existing] = await db
        .select()
        .from(bodyTdeeEstimates)
        .where(eq(bodyTdeeEstimates.date, date));
      if (existing) return false;
      await db.insert(bodyTdeeEstimates).values({
        date,
        tdeeKcal: Number(r.tdee_kcal),
        rawKcal: Number(r.raw_kcal),
        formulaKcal: Number(r.formula_kcal),
        correctionKcal: Number(r.correction_kcal),
        clamped: Boolean(r.clamped),
        basis: (r.basis ?? {}) as Record<string, unknown>,
        dirty: false,
      });
      return true;
    },
  },
  {
    server: 'body_target_changes',
    onConflict: 'user_id,date',
    dirty: () => db.select().from(bodyTargetChanges).where(eq(bodyTargetChanges.dirty, true)),
    toServer: (r) => ({ date: r.date, intake_kcal: r.intakeKcal, reason: r.reason }),
    key: (r) => ({ date: String(r.date) }),
    markPushed: async (r) => {
      await db
        .update(bodyTargetChanges)
        .set({ dirty: false })
        .where(eq(bodyTargetChanges.date, String(r.date)));
    },
    apply: async (r) => {
      const date = String(r.date);
      const [existing] = await db
        .select()
        .from(bodyTargetChanges)
        .where(eq(bodyTargetChanges.date, date));
      if (existing) return false;
      await db.insert(bodyTargetChanges).values({
        date,
        intakeKcal: Number(r.intake_kcal),
        reason: r.reason as StoredTargetChange['reason'],
        dirty: false,
      });
      return true;
    },
  },
];

SPECS.push({
  server: 'body_goals',
  onConflict: 'user_id,id',
  dirty: () => db.select().from(bodyGoals).where(eq(bodyGoals.dirty, true)),
  toServer: (r) => ({
    id: r.id,
    created_at: r.createdAt,
    kind: r.kind,
    start_weight_kg: r.startWeightKg,
    target_weight_kg: r.targetWeightKg,
    rate_per_week_kg: r.ratePerWeekKg,
    eat_back_pct: r.eatBackPct,
    weekly_mode: r.weeklyMode,
    adjustment_kcal: r.adjustmentKcal,
    paused: r.paused,
    reason: r.reason,
  }),
  key: (r) => ({ id: String(r.id) }),
  markPushed: async (r) => {
    await db
      .update(bodyGoals)
      .set({ dirty: false })
      .where(eq(bodyGoals.id, String(r.id)));
  },
  apply: async (r) => {
    const id = String(r.id);
    const [existing] = await db.select().from(bodyGoals).where(eq(bodyGoals.id, id));
    if (existing) return false;
    await db.insert(bodyGoals).values({
      id,
      createdAt: String(r.created_at),
      kind: r.kind as StoredGoal['kind'],
      startWeightKg: Number(r.start_weight_kg),
      targetWeightKg: numOrNull(r.target_weight_kg),
      ratePerWeekKg: Number(r.rate_per_week_kg),
      eatBackPct: Number(r.eat_back_pct),
      weeklyMode: Boolean(r.weekly_mode),
      adjustmentKcal: Number(r.adjustment_kcal),
      paused: Boolean(r.paused),
      reason: r.reason as StoredGoal['reason'],
      dirty: false,
    });
    return true;
  },
});

SPECS.push({
  server: 'body_foods',
  onConflict: 'user_id,id',
  dirty: () => db.select().from(bodyFoods).where(eq(bodyFoods.dirty, true)),
  toServer: (r) =>
    r.deleted
      ? null
      : {
          id: r.id,
          kind: r.kind,
          name: r.name,
          brand: r.brand,
          barcode: r.barcode,
          basis: r.basis,
          kcal: r.kcal,
          protein_g: r.proteinG,
          carbs_g: r.carbsG,
          fat_g: r.fatG,
          piece_amount: r.pieceAmount,
          portions: r.portions,
          recipe: r.recipe,
          favourite: r.favourite,
          last_used_at: r.lastUsedAt,
          created_at: r.createdAt,
          updated_at: r.updatedAt,
        },
  key: (r) => ({ id: String(r.id) }),
  markPushed: async (r) => {
    if (r.deleted) await db.delete(bodyFoods).where(eq(bodyFoods.id, String(r.id)));
    else
      await db
        .update(bodyFoods)
        .set({ dirty: false })
        .where(eq(bodyFoods.id, String(r.id)));
  },
  apply: async (r) => {
    const id = String(r.id);
    const [existing] = await db.select().from(bodyFoods).where(eq(bodyFoods.id, id));
    if (existing?.dirty) return false;
    const row = {
      id,
      kind: r.kind as FoodItem['kind'],
      name: String(r.name),
      brand: str(r.brand),
      barcode: str(r.barcode),
      basis: r.basis as FoodItem['basis'],
      kcal: Number(r.kcal),
      proteinG: Number(r.protein_g),
      carbsG: Number(r.carbs_g),
      fatG: Number(r.fat_g),
      pieceAmount: numOrNull(r.piece_amount),
      portions: (r.portions ?? []) as FoodItem['portions'],
      recipe: (r.recipe ?? null) as FoodItem['recipe'],
      favourite: Boolean(r.favourite),
      lastUsedAt: str(r.last_used_at),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      dirty: false,
      deleted: false,
    };
    await db.insert(bodyFoods).values(row).onConflictDoUpdate({ target: bodyFoods.id, set: row });
    return true;
  },
});

type Photos = Measurement['photos'];

const pendingPhotos = (photos: Photos) =>
  Object.values(photos).some((p) => p && (p.removed || (p.localUri && !p.remotePath)));

const serverPhotos = (photos: Photos) =>
  Object.fromEntries(
    PHOTO_SLOTS.flatMap((slot) => {
      const p = photos[slot];
      return p?.remotePath && !p.removed ? [[slot, p.remotePath]] : [];
    }),
  );

SPECS.push({
  server: 'body_measurements',
  onConflict: 'user_id,id',
  dirty: () => db.select().from(bodyMeasurements).where(eq(bodyMeasurements.dirty, true)),
  toServer: (r) =>
    r.deleted
      ? null
      : {
          id: r.id,
          day: r.day,
          values: r.values,
          body_fat_pct: r.bodyFatPct,
          body_fat_source: r.bodyFatSource,
          note: r.note,
          photos: serverPhotos(r.photos as Photos),
          created_at: r.createdAt,
          updated_at: r.updatedAt,
        },
  key: (r) => ({ id: String(r.id) }),
  markPushed: async (r) => {
    const id = String(r.id);
    if (r.deleted) await db.delete(bodyMeasurements).where(eq(bodyMeasurements.id, id));
    // A photo that did not upload keeps the row dirty, so the next sync tries again.
    else if (!pendingPhotos(r.photos as Photos))
      await db.update(bodyMeasurements).set({ dirty: false }).where(eq(bodyMeasurements.id, id));
  },
  apply: async (r) => {
    const id = String(r.id);
    const [existing] = await db.select().from(bodyMeasurements).where(eq(bodyMeasurements.id, id));
    if (existing?.dirty) return false;
    const photos: Photos = {};
    for (const [slot, path] of Object.entries((r.photos ?? {}) as Record<string, unknown>)) {
      if (!PHOTO_SLOTS.includes(slot as PhotoSlot) || typeof path !== 'string') continue;
      const local = existing?.photos[slot as PhotoSlot];
      photos[slot as PhotoSlot] = {
        localUri: local?.remotePath === path ? local.localUri : null,
        remotePath: path,
      };
    }
    const row = {
      id,
      day: String(r.day),
      values: (r.values ?? {}) as Record<string, number>,
      bodyFatPct: numOrNull(r.body_fat_pct),
      bodyFatSource: str(r.body_fat_source) as Measurement['bodyFatSource'],
      note: str(r.note),
      photos,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      dirty: false,
      deleted: false,
    };
    await db
      .insert(bodyMeasurements)
      .values(row)
      .onConflictDoUpdate({ target: bodyMeasurements.id, set: row });
    return true;
  },
});

/**
 * Before the check-ins go up: uploads new photos (private bucket, own folder), removes the ones
 * the user replaced, removed or deleted with their check-in. Failures stay pending for later.
 */
async function syncPhotos(client: SupabaseClient, userId: string): Promise<void> {
  const rows = await db.select().from(bodyMeasurements).where(eq(bodyMeasurements.dirty, true));
  for (const row of rows) {
    if (row.deleted) {
      const paths = PHOTO_SLOTS.map((s) => row.photos[s]?.remotePath).filter((p): p is string =>
        Boolean(p),
      );
      await removeRemotePhotos(client, paths);
      continue;
    }
    if (!pendingPhotos(row.photos)) continue;
    const photos: Photos = { ...row.photos };
    for (const slot of PHOTO_SLOTS) {
      const p = photos[slot];
      if (!p) continue;
      if (p.removed) {
        if (p.remotePath) await removeRemotePhotos(client, [p.remotePath]);
        delete photos[slot];
      } else if (p.localUri && !p.remotePath) {
        const path = await uploadPhoto(client, p.localUri, remotePath(userId, row.id, slot));
        if (path) photos[slot] = { ...p, remotePath: path };
      }
    }
    await db.update(bodyMeasurements).set({ photos }).where(eq(bodyMeasurements.id, row.id));
  }
}

const cursorKey = (server: string) => `body.cursor.${server}`;

/**
 * Pushes dirty rows, then pulls rows changed on the server since the last cursor. Rows the server
 * refuses (the add-on is not active there) stay dirty and go up with a later sync – nothing is
 * lost, and nothing is unlocked by the client.
 */
export async function syncBody(client: SupabaseClient, userId: string): Promise<boolean> {
  let changed = false;
  await syncPhotos(client, userId);
  for (const spec of SPECS) {
    for (const row of await spec.dirty()) {
      const values = spec.toServer(row);
      const table = client.from(spec.server);
      const result = values
        ? await table.upsert({ ...values, user_id: userId }, { onConflict: spec.onConflict })
        : await table.delete().match(spec.key(row));
      if (!result.error) await spec.markPushed(row);
    }
    const key = cursorKey(spec.server);
    const stored = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) });
    const cursor = stored?.value ?? '1970-01-01T00:00:00Z';
    const { data, error } = await client.from(spec.server).select('*').gt('updated_at', cursor);
    if (error) continue;
    let next = cursor;
    for (const r of (data ?? []) as Row[]) {
      changed = (await spec.apply(r)) || changed;
      if (String(r.updated_at) > next) next = String(r.updated_at);
    }
    if (next !== cursor) {
      await db
        .insert(appSettings)
        .values({ key, value: next })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: next } });
    }
  }
  return changed;
}
