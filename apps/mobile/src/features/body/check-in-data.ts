import { checkInChanges, pickBySource, type CheckInValues, type Measurements } from '@peakr/engine';
import { useQuery } from '@tanstack/react-query';

import type { CheckIn, Measurement } from '@/data/repositories/body-repository';
import * as repo from '@/data/repositories/body-repository';
import { getDailyValues } from '@/data/repositories/health-repository';

import { bodyKeys, useCheckIns, useMeasurements } from './queries';

/**
 * The check-in history: weigh-ins (several per day) and check-ins (measurements, body fat,
 * photos, note) joined by day, newest first, each with its changes to the previous day that had
 * the same value (the engine computes them).
 */

export interface HistoryDay {
  day: string;
  /** The day's value: its last weigh-in. */
  weighIn: CheckIn | null;
  weighIns: CheckIn[];
  checkIn: Measurement | null;
  values: CheckInValues;
  changes: CheckInValues;
}

const valuesOf = (weighIn: CheckIn | null, checkIn: Measurement | null): CheckInValues => ({
  weightKg: weighIn?.weightKg ?? null,
  bodyFatPct: checkIn?.bodyFatPct ?? weighIn?.bodyFatPct ?? null,
  measurements: (checkIn?.values ?? {}) as Measurements,
});

export function historyDays(
  weighIns: readonly CheckIn[],
  checkIns: readonly Measurement[],
): HistoryDay[] {
  const days = [...new Set([...weighIns.map((w) => w.day), ...checkIns.map((c) => c.day)])].sort();
  const out: HistoryDay[] = [];
  // The latest earlier value of each kind, so a change compares like with like.
  const last: CheckInValues = { weightKg: null, bodyFatPct: null, measurements: {} };
  for (const day of days) {
    const dayWeighIns = weighIns
      .filter((w) => w.day === day)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const weighIn = dayWeighIns.at(-1) ?? null;
    const checkIn = checkIns.filter((c) => c.day === day).at(-1) ?? null;
    const values = valuesOf(weighIn, checkIn);
    out.push({
      day,
      weighIn,
      weighIns: dayWeighIns,
      checkIn,
      values,
      changes: checkInChanges(values, last),
    });
    if (values.weightKg !== null) last.weightKg = values.weightKg;
    if (values.bodyFatPct !== null) last.bodyFatPct = values.bodyFatPct;
    last.measurements = { ...last.measurements, ...values.measurements };
  }
  return out.reverse();
}

export function useHistory() {
  const weighIns = useCheckIns();
  const checkIns = useMeasurements();
  return {
    isPending: weighIns.isPending || checkIns.isPending,
    days: historyDays(weighIns.data ?? [], checkIns.data ?? []),
  };
}

/** The last value of every measurement before `day` (for the plausibility warnings). */
export function previousMeasurements(
  checkIns: readonly Measurement[],
  day: string,
  exceptId?: string,
): Partial<Record<string, { value: number; day: string }>> {
  const out: Partial<Record<string, { value: number; day: string }>> = {};
  for (const c of [...checkIns].sort((a, b) => a.day.localeCompare(b.day))) {
    if (c.day >= day || c.id === exceptId) continue;
    for (const [k, v] of Object.entries(c.values)) out[k] = { value: v, day: c.day };
  }
  return out;
}

/** A scale's body fat for a day (Garmin, Health Connect / HealthKit), by source priority. */
export function useScaleBodyFat(day: string) {
  return useQuery({
    queryKey: [...bodyKeys.all, 'scaleFat', day],
    queryFn: async () => {
      const [device, garmin] = await Promise.all([
        repo.listDeviceValues(day),
        getDailyValues({ metrics: ['body_fat'], from: day }).catch(() => []),
      ]);
      return pickBySource([
        ...device
          .filter((d) => d.metric === 'body_fat' && d.day === day)
          .map((d) => ({ source: d.source, value: d.value })),
        ...garmin.filter((g) => g.day === day).map((g) => ({ source: g.source, value: g.value })),
      ]);
    },
  });
}
