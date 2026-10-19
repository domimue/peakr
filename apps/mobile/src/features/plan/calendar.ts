import type { ActivitySport, Plan, PlanWeek } from '@peakr/engine';

import type { ThemeColors } from '@/ui';

/** Calendar maths on ISO dates (`YYYY-MM-DD`), UTC-based so it never shifts with time zones. */

const DAY_MS = 86_400_000;

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function mondayOf(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function weekOfPlan(plan: Plan, date: string): PlanWeek | undefined {
  const monday = mondayOf(date);
  return plan.weeks.find((w) => w.startDate === monday);
}

/** The Monday to show first: this week inside the plan, else the plan's first or last week. */
export function initialWeek(plan: Plan, today: string): string {
  const first = plan.weeks[0]?.startDate ?? mondayOf(today);
  const last = plan.weeks[plan.weeks.length - 1]?.startDate ?? first;
  const monday = mondayOf(today);
  return monday < first ? first : monday > last ? last : monday;
}

/** Date formatting in the app language (dates are calendar days, shown in UTC). */
export function formatDate(
  iso: string,
  language: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(language, {
    ...options,
    timeZone: 'UTC',
  });
}

const SPORT_COLOR: Record<ActivitySport, keyof ThemeColors> = {
  run: 'sportRun',
  bike: 'sportBike',
  swim: 'sportSwim',
  strength: 'sportStrength',
  brick: 'sportBrick',
  xcski: 'sportWinter',
  skitour: 'sportWinter',
  snowshoe: 'sportWinter',
  walk: 'sportCommute',
};

export function sportColor(colors: ThemeColors, sport: ActivitySport): string {
  return colors[SPORT_COLOR[sport]];
}
