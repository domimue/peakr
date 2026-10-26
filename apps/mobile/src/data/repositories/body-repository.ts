import type { BodyProfile } from '@peakr/engine';
import type { SupabaseClient } from '@supabase/supabase-js';
import { and, asc, eq, gte } from 'drizzle-orm';

import { db } from '../db/client';
import {
  appSettings,
  bodyCheckins,
  bodyDays,
  bodyDeviceDaily,
  bodyFoodEntries,
  bodyGoals,
  bodyTargetChanges,
  bodyTdeeEstimates,
} from '../db/schema';
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
  bodyFatPct: number | null;
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
  bodyFatPct: r.bodyFatPct,
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
    toServer: (r) => ({ day: r.day, incomplete: r.incomplete, updated_at: r.updatedAt }),
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

const cursorKey = (server: string) => `body.cursor.${server}`;

/**
 * Pushes dirty rows, then pulls rows changed on the server since the last cursor. Rows the server
 * refuses (the add-on is not active there) stay dirty and go up with a later sync – nothing is
 * lost, and nothing is unlocked by the client.
 */
export async function syncBody(client: SupabaseClient, userId: string): Promise<boolean> {
  let changed = false;
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
