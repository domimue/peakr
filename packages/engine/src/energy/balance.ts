import { energyConfig as C } from './config';

/** One day of the energy model. */
export interface EnergyDay {
  day: string;
  /** Logged intake; null when nothing was logged. */
  intakeKcal: number | null;
  /** False when the user marked the day as incomplete (or it is not logged). */
  complete: boolean;
  restingKcal: number;
  activeKcal: number;
}

/** Intake − resting − active (negative = deficit); null without logged intake. */
export function dayBalance(d: EnergyDay): number | null {
  return d.intakeKcal === null ? null : Math.round(d.intakeKcal - d.restingKcal - d.activeKcal);
}

export const isLogged = (d: EnergyDay) => d.complete && d.intakeKcal !== null;

export interface WeekBalance {
  days: number;
  completeDays: number;
  /** Sum over complete days. */
  balanceKcal: number;
  avgDailyKcal: number | null;
  /** Estimated fat change (7,700 kcal per kg; negative = loss). An estimate, labelled as one. */
  fatKg: number;
}

export function weekBalance(days: readonly EnergyDay[]): WeekBalance {
  const logged = days.filter(isLogged);
  const balanceKcal = logged.reduce((sum, d) => sum + (dayBalance(d) as number), 0);
  return {
    days: days.length,
    completeDays: logged.length,
    balanceKcal,
    avgDailyKcal: logged.length ? Math.round(balanceKcal / logged.length) : null,
    fatKg: balanceKcal / C.kcalPerKgFat,
  };
}
