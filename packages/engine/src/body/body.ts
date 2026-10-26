import type { BodySex } from '../energy/energy';
import { daysBetween } from '../energy/energy';
import type { Result } from '../result';

/**
 * Body check-in (CLAUDE.md "Energy & body rules"): measurement fields with plausibility checks,
 * the US Navy body fat estimate, changes between check-ins, the measuring rhythm, and the import
 * of the Körper-Tracker prototype's backup.
 */

export type MeasurementKey =
  | 'neck'
  | 'waist'
  | 'belly'
  | 'hip'
  | 'chest'
  | 'shoulder'
  | 'armL'
  | 'armR'
  | 'forearm'
  | 'thighL'
  | 'thighR'
  | 'calfL'
  | 'calfR';

export interface MeasurementField {
  key: MeasurementKey;
  /** Shown by default; the others are collapsible. */
  core: boolean;
  /** Plausible range in cm. */
  min: number;
  max: number;
  /** A larger change than this per week (since the last measurement) gets a warning. */
  maxChangePerWeekCm: number;
}

const field = (
  key: MeasurementKey,
  core: boolean,
  min: number,
  max: number,
  perWeek: number,
): MeasurementField => ({
  key,
  core,
  min,
  max,
  maxChangePerWeekCm: perWeek,
});

export const MEASUREMENTS: readonly MeasurementField[] = [
  field('neck', true, 20, 70, 1),
  field('waist', true, 40, 200, 3),
  field('belly', true, 40, 220, 3),
  field('hip', true, 50, 220, 3),
  field('chest', false, 50, 200, 3),
  field('shoulder', false, 60, 200, 3),
  field('armL', false, 15, 70, 1.5),
  field('armR', false, 15, 70, 1.5),
  field('forearm', false, 15, 50, 1),
  field('thighL', false, 30, 100, 2),
  field('thighR', false, 30, 100, 2),
  field('calfL', false, 20, 70, 1.5),
  field('calfR', false, 20, 70, 1.5),
];
export const CORE_MEASUREMENTS = MEASUREMENTS.filter((m) => m.core);
export const EXTRA_MEASUREMENTS = MEASUREMENTS.filter((m) => !m.core);
const BY_KEY = new Map(MEASUREMENTS.map((m) => [m.key, m]));

export type Measurements = Partial<Record<MeasurementKey, number>>;
export type PlausibilityWarning = 'outOfRange' | 'jump';

/** Weeks between two days, at least one (a check-in a day later is judged like a week later). */
const weeksBetween = (a: string, b: string) => Math.max(1, daysBetween(a, b) / 7);

/** A measurement out of range, or changed more than plausible since the last one. */
export function measurementWarning(
  key: MeasurementKey,
  value: number,
  previous: { value: number; day: string } | null,
  day: string,
): PlausibilityWarning | null {
  const f = BY_KEY.get(key) as MeasurementField;
  if (!(value >= f.min && value <= f.max)) return 'outOfRange';
  if (!previous) return null;
  const allowed = f.maxChangePerWeekCm * weeksBetween(previous.day, day);
  return Math.abs(value - previous.value) > allowed ? 'jump' : null;
}

export const WEIGHT_LIMITS = {
  min: 25,
  max: 350,
  maxChangePerDayShare: 0.03,
  maxChangePerWeekShare: 0.03,
};

/**
 * A weigh-in out of range, or further from the last one than water and food explain (3 % in a day;
 * over longer gaps 3 % per week).
 */
export function weightWarning(
  kg: number,
  previous: { value: number; day: string } | null,
  day: string,
): PlausibilityWarning | null {
  if (!(kg >= WEIGHT_LIMITS.min && kg <= WEIGHT_LIMITS.max)) return 'outOfRange';
  if (!previous) return null;
  const days = Math.max(1, daysBetween(previous.day, day));
  const share =
    days < 7
      ? WEIGHT_LIMITS.maxChangePerDayShare
      : (WEIGHT_LIMITS.maxChangePerWeekShare * days) / 7;
  return Math.abs(kg - previous.value) > previous.value * share ? 'jump' : null;
}

/**
 * US Navy body fat (Hodgdon & Beckett) – an estimate, always shown as one. Men: height, neck,
 * abdomen at the navel (the waist if no belly value); women: height, neck, natural waist and hip.
 */
export function navyBodyFat(input: {
  sex: BodySex;
  heightCm: number;
  neckCm?: number;
  waistCm?: number;
  bellyCm?: number;
  hipCm?: number;
}): number | null {
  const { heightCm: h, neckCm: neck } = input;
  if (!neck || !(h > 0)) return null;
  const L = Math.log10;
  let pct: number;
  if (input.sex === 'male') {
    const abdomen = input.bellyCm ?? input.waistCm;
    if (!abdomen || abdomen - neck <= 0) return null;
    pct = 495 / (1.0324 - 0.19077 * L(abdomen - neck) + 0.15456 * L(h)) - 450;
  } else {
    const waist = input.waistCm ?? input.bellyCm;
    if (!waist || !input.hipCm) return null;
    pct = 495 / (1.29579 - 0.35004 * L(waist + input.hipCm - neck) + 0.221 * L(h)) - 450;
  }
  return pct > 2 && pct < 70 ? Math.round(pct * 10) / 10 : null;
}

export interface CheckInValues {
  weightKg: number | null;
  bodyFatPct: number | null;
  measurements: Measurements;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Differences to the previous check-in, where both have a value. */
export function checkInChanges(
  current: CheckInValues,
  previous: CheckInValues | null,
): CheckInValues {
  const diff = (a: number | null, b: number | null | undefined) =>
    a !== null && b !== null && b !== undefined ? r1(a - b) : null;
  const measurements: Measurements = {};
  if (previous) {
    for (const [k, v] of Object.entries(current.measurements) as [MeasurementKey, number][]) {
      const d = diff(v, previous.measurements[k]);
      if (d !== null) measurements[k] = d;
    }
  }
  return {
    weightKg: diff(current.weightKg, previous?.weightKg),
    bodyFatPct: diff(current.bodyFatPct, previous?.bodyFatPct),
    measurements,
  };
}

/** The next measuring day (0 = Sunday … 6 = Saturday) on or after `today`. */
export function nextMeasureDay(today: string, weekday: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((weekday - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// Körper-Tracker prototype backup ({ settings, entries } as its "Backup (JSON)" wrote it)

export interface PrototypeImport {
  profile: {
    heightCm?: number;
    sex?: BodySex;
    measureWeekday?: number;
    weighDaily?: boolean;
    goalKg?: number;
  };
  checkIns: {
    day: string;
    weightKg: number | null;
    bodyFatPct: number | null;
    measurements: Measurements;
    note: string | null;
  }[];
  days: { day: string; intakeKcal: number | null; activeKcal: number | null }[];
  /** Entries without a usable date. */
  skipped: number;
  /** Photos live in the prototype's own storage and cannot come along in the JSON. */
  photosNotImported: number;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parsePrototypeBackup(json: unknown): Result<PrototypeImport, 'file'> {
  const list = Array.isArray(json)
    ? json
    : isObj(json) && Array.isArray(json.entries)
      ? json.entries
      : null;
  if (!list) return { ok: false, issues: [{ field: 'file', code: 'invalidFormat' }] };
  const s = isObj(json) && isObj(json.settings) ? json.settings : {};
  const profile: PrototypeImport['profile'] = {};
  const height = num(s.height);
  if (height) profile.heightCm = height;
  if (s.sex === 'm' || s.sex === 'f') profile.sex = s.sex === 'm' ? 'male' : 'female';
  const weekday = num(s.weekday);
  if (weekday !== null && weekday >= 0 && weekday <= 6) profile.measureWeekday = weekday;
  if (s.cadence === 'weekly' || s.cadence === 'daily') profile.weighDaily = s.cadence === 'daily';
  const goal = num(s.goal);
  if (goal) profile.goalKg = goal;

  const out: PrototypeImport = {
    profile,
    checkIns: [],
    days: [],
    skipped: 0,
    photosNotImported: 0,
  };
  const days = new Map<string, PrototypeImport['days'][number]>();
  for (const raw of list) {
    if (!isObj(raw) || typeof raw.date !== 'string' || !ISO.test(raw.date)) {
      out.skipped++;
      continue;
    }
    const measurements: Measurements = {};
    if (isObj(raw.m)) {
      for (const [k, v] of Object.entries(raw.m)) {
        const n = num(v);
        if (BY_KEY.has(k as MeasurementKey) && n !== null) measurements[k as MeasurementKey] = n;
      }
    }
    if (isObj(raw.photos))
      out.photosNotImported += Object.values(raw.photos).filter(Boolean).length;
    out.checkIns.push({
      day: raw.date,
      weightKg: num(raw.weight),
      bodyFatPct: num(raw.bodyfat),
      measurements,
      note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null,
    });
    if (isObj(raw.days)) {
      for (const [day, v] of Object.entries(raw.days)) {
        if (!ISO.test(day) || !isObj(v)) continue;
        const intake = num(v.in);
        const active = num(v.active);
        if (intake === null && active === null) continue;
        days.set(day, { day, intakeKcal: intake, activeKcal: active });
      }
    }
  }
  out.checkIns.sort((a, b) => a.day.localeCompare(b.day));
  out.days = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  return { ok: true, value: out };
}
