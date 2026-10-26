import type { BodyProfile } from '@peakr/engine';
import type { SupabaseClient } from '@supabase/supabase-js';
import { and, asc, eq } from 'drizzle-orm';

import { db } from '../db/client';
import { appSettings, bodyCheckins, bodyFoodEntries } from '../db/schema';
import { newId } from '../ids';
import { supabase } from '../supabase';
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
  createdAt: string;
}

export interface CheckIn {
  id: string;
  day: string;
  weightKg: number;
  waistCm: number | null;
  note: string | null;
  createdAt: string;
}

export type FoodDraft = Omit<FoodEntry, 'id' | 'createdAt'>;
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
  createdAt: r.createdAt,
});

const toCheckIn = (r: typeof bodyCheckins.$inferSelect): CheckIn => ({
  id: r.id,
  day: r.day,
  weightKg: r.weightKg,
  waistCm: r.waistCm,
  note: r.note,
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
  const row = { ...draft, id: newId(), createdAt: at, updatedAt: at, dirty: true, deleted: false };
  await db.insert(bodyFoodEntries).values(row);
  return toEntry(row);
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
  const row = { ...draft, id: newId(), createdAt: at, updatedAt: at, dirty: true, deleted: false };
  await db.insert(bodyCheckins).values(row);
  return toCheckIn(row);
}

export async function deleteCheckIn(id: string): Promise<void> {
  await db
    .update(bodyCheckins)
    .set({ deleted: true, dirty: true, updatedAt: now() })
    .where(eq(bodyCheckins.id, id));
}

// ---------------------------------------------------------------------------------------------
// Sync (called from `syncOnce`): push what changed here, pull what another device wrote.

const CURSOR_KEY = 'body.cursor';

/**
 * Pushes dirty rows. Rows the server refuses (the add-on is not active there) stay dirty and go
 * up with a later sync – nothing is lost, and nothing is unlocked by the client.
 */
export async function syncBody(client: SupabaseClient, userId: string): Promise<boolean> {
  for (const [table, local] of [
    ['body_food_entries', bodyFoodEntries],
    ['body_checkins', bodyCheckins],
  ] as const) {
    const dirty = await db.select().from(local).where(eq(local.dirty, true));
    for (const row of dirty) {
      const { dirty: _dirty, deleted, createdAt, updatedAt, ...values } = row;
      const result = deleted
        ? await client.from(table).delete().eq('id', row.id)
        : await client.from(table).upsert({
            ...toServer(values),
            user_id: userId,
            created_at: createdAt,
            updated_at: updatedAt,
          });
      if (result.error) continue;
      if (deleted) await db.delete(local).where(eq(local.id, row.id));
      else await db.update(local).set({ dirty: false }).where(eq(local.id, row.id));
    }
  }
  return pullBody(client);
}

const SNAKE: Record<string, string> = {
  proteinG: 'protein_g',
  weightKg: 'weight_kg',
  waistCm: 'waist_cm',
};

function toServer(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [SNAKE[k] ?? k, v]));
}

async function pullBody(client: SupabaseClient): Promise<boolean> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, CURSOR_KEY) });
  const cursor = row?.value ?? '1970-01-01T00:00:00Z';
  let next = cursor;
  let changed = false;
  const food = await client.from('body_food_entries').select('*').gt('updated_at', cursor);
  for (const r of (food.data ?? []) as Record<string, string | number | null>[]) {
    changed =
      (await upsertFromServer(bodyFoodEntries, r, {
        day: String(r.day),
        meal: r.meal as Meal,
        name: String(r.name),
        kcal: Number(r.kcal),
        proteinG: r.protein_g === null ? null : Number(r.protein_g),
      })) || changed;
    if (String(r.updated_at) > next) next = String(r.updated_at);
  }
  const checkIns = await client.from('body_checkins').select('*').gt('updated_at', cursor);
  for (const r of (checkIns.data ?? []) as Record<string, string | number | null>[]) {
    changed =
      (await upsertFromServer(bodyCheckins, r, {
        day: String(r.day),
        weightKg: Number(r.weight_kg),
        waistCm: r.waist_cm === null ? null : Number(r.waist_cm),
        note: r.note === null ? null : String(r.note),
      })) || changed;
    if (String(r.updated_at) > next) next = String(r.updated_at);
  }
  if (next !== cursor) {
    await db
      .insert(appSettings)
      .values({ key: CURSOR_KEY, value: next })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: next } });
  }
  return changed;
}

/** A server row replaces the local one unless this device changed it since (pushed next sync). */
async function upsertFromServer(
  table: typeof bodyFoodEntries | typeof bodyCheckins,
  r: Record<string, string | number | null>,
  values: Record<string, unknown>,
): Promise<boolean> {
  const id = String(r.id);
  const [existing] = await db.select().from(table).where(eq(table.id, id));
  if (existing?.dirty) return false;
  const row = {
    id,
    ...values,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    dirty: false,
    deleted: false,
  };
  await db
    .insert(table)
    .values(row as never)
    .onConflictDoUpdate({ target: table.id, set: row as never });
  return true;
}
