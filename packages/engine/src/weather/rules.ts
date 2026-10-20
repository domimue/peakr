import { planConfig } from '../plan/config';
import { parseIsoDate, toIsoDate, weekdayOf } from '../plan/dates';
import {
  allWorkouts,
  findWorkout,
  isPaused,
  moveWorkout,
  planRange,
  statusOf,
  type PlanInput,
  type PlanState,
} from '../plan/edit';
import { indoorVersion } from '../plan/indoor';
import type { UserProfile, Workout } from '../plan/types';
import type {
  WeatherAction,
  WeatherCondition,
  WeatherExposure,
  WeatherForecast,
  WeatherHint,
  WeatherHour,
  WeatherReason,
} from './types';

/**
 * Weather check (CLAUDE.md "Real-life & seasonal adaptation" 4): heavy rain, snowfall, freezing
 * rain / ice and storm at the planned session time trigger a hint with an indoor alternative of
 * equivalent load or "move to another day". Rain, snow, ice and wind only – no heat logic. The
 * engine only suggests; nothing in the plan changes until the user picks an option.
 */

const cfg = planConfig.weather;

const SEVERITY: readonly WeatherReason[] = ['thunderstorm', 'ice', 'storm', 'snow', 'heavyRain'];

// WMO weather interpretation codes.
const THUNDER = new Set([95, 96, 99]);
const FREEZING = new Set([56, 57, 66, 67]);
const HEAVY_RAIN = new Set([65, 82]);
const HEAVY_SNOW = new Set([75, 86]);

/** WMO code (or the amounts, without a code) → what the chip shows. */
export function weatherCondition(h: WeatherHour): WeatherCondition {
  const c = h.weatherCode;
  if (c !== null) {
    if (THUNDER.has(c)) return 'thunderstorm';
    if (FREEZING.has(c)) return 'freezingRain';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
    if ((c >= 61 && c <= 65) || (c >= 80 && c <= 82)) return 'rain';
    if (c >= 51 && c <= 55) return 'drizzle';
    if (c === 45 || c === 48) return 'fog';
    if (c === 3) return 'cloudy';
    if (c === 1 || c === 2) return 'partlyCloudy';
    return 'clear';
  }
  if ((h.snowfallCm ?? 0) > 0) return 'snow';
  if ((h.precipitationMm ?? 0) >= 0.5) return 'rain';
  if ((h.precipitationMm ?? 0) > 0) return 'drizzle';
  return 'clear';
}

/**
 * Which thresholds apply, or null for sessions the weather does not affect: strength, pool swims
 * (only open water goes outside). Commutes count – they get "skip" instead of an indoor option.
 */
export function weatherExposure(w: Workout, profile: UserProfile): WeatherExposure | null {
  switch (w.sport) {
    case 'run':
    case 'walk':
      return 'run';
    case 'bike':
    case 'brick':
      return 'bike';
    case 'swim':
      return w.templateId === 'swim.openwater' || profile.poolLength === 'openwater'
        ? 'swim'
        : null;
    case 'xcski':
    case 'skitour':
    case 'snowshoe':
      return 'winter';
    default:
      return null;
  }
}

const hourKey = (date: string, hour: number) => `${date}T${String(hour).padStart(2, '0')}:00`;

/** The hours a session at `startHour` covers (at least one). */
export function sessionHours(
  forecast: WeatherForecast,
  date: string,
  startHour: number,
  durationMin: number,
): WeatherHour[] {
  const count = Math.max(1, Math.ceil(durationMin / 60));
  const keys = new Set(
    Array.from({ length: count }, (_, i) => startHour + i)
      .filter((h) => h < 24)
      .map((h) => hourKey(date, h)),
  );
  return forecast.hours.filter((h) => keys.has(h.time));
}

/** The forecast hour at a date and local hour (Today chip), or null outside the forecast. */
export function forecastAt(
  forecast: WeatherForecast,
  date: string,
  hour: number,
): WeatherHour | null {
  return forecast.hours.find((h) => h.time === hourKey(date, hour)) ?? null;
}

const n = (v: number | null) => v ?? 0;

/** Reasons in one hour, given the hours before it (black ice after rain). */
function hourReasons(h: WeatherHour, before: readonly WeatherHour[], e: WeatherExposure) {
  const reasons = new Set<WeatherReason>();
  const code = h.weatherCode;
  if (code !== null && THUNDER.has(code)) reasons.add('thunderstorm');

  if (e === 'run' || e === 'bike') {
    const temp = h.temperatureC;
    const freezingPrecip =
      temp !== null && temp <= cfg.iceTempC && n(h.precipitationMm) >= cfg.iceMinPrecipMm;
    const wetBefore = before.reduce((sum, b) => sum + n(b.precipitationMm), 0) >= cfg.blackIceWetMm;
    const blackIce = temp !== null && temp <= 0 && wetBefore;
    // Snow on frozen ground is "snow", not ice; freezing rain codes always are ice.
    if (
      (code !== null && FREEZING.has(code)) ||
      ((freezingPrecip || blackIce) && n(h.snowfallCm) === 0)
    ) {
      reasons.add('ice');
    }
  }

  const gust = cfg.stormGustKmh[e];
  if (gust !== null && n(h.windGustKmh) >= gust) reasons.add('storm');

  const snow = cfg.snowCmPerHour[e];
  if (snow !== null && (n(h.snowfallCm) >= snow || (code !== null && HEAVY_SNOW.has(code)))) {
    reasons.add('snow');
  }

  const rain = cfg.heavyRainMmPerHour[e];
  const rainOnly = n(h.precipitationMm) - n(h.snowfallCm) * 0.7; // ~0.7 mm water per cm of snow
  if (rain !== null && (rainOnly >= rain || (code !== null && HEAVY_RAIN.has(code)))) {
    reasons.add('heavyRain');
  }
  return reasons;
}

/** Which conditions trigger a hint for a session at `startHour` (local) on its date. */
export function weatherReasons(
  forecast: WeatherForecast,
  w: Workout,
  profile: UserProfile,
  startHour: number,
): { reasons: WeatherReason[]; from: string } | null {
  const exposure = weatherExposure(w, profile);
  if (!exposure) return null;
  const hours = sessionHours(forecast, w.date, startHour, w.durationMin);
  if (hours.length === 0) return null;

  const all = new Set<WeatherReason>();
  let from: string | null = null;
  for (const h of hours) {
    const index = forecast.hours.indexOf(h);
    const before = forecast.hours.slice(Math.max(0, index - cfg.blackIceLookbackHours), index);
    const found = hourReasons(h, before, exposure);
    if (found.size > 0 && from === null) from = h.time;
    found.forEach((r) => all.add(r));
  }
  const sessionMm = cfg.heavyRainSessionMm[exposure];
  if (sessionMm !== null) {
    const total = hours.reduce((sum, h) => sum + n(h.precipitationMm) - n(h.snowfallCm) * 0.7, 0);
    if (total >= sessionMm) {
      all.add('heavyRain');
      from ??= (hours[0] as WeatherHour).time;
    }
  }
  if (all.size === 0 || from === null) return null;
  return { reasons: SEVERITY.filter((r) => all.has(r)), from };
}

/**
 * The hint for one session, or null: no hint when the weather is fine, the session is not
 * outdoors, it is done or skipped, or the forecast does not reach its time.
 */
export function weatherHint(
  forecast: WeatherForecast,
  state: PlanState,
  w: Workout,
  profile: UserProfile,
  startHour: number = cfg.defaultSessionHour,
): WeatherHint | null {
  if (statusOf(state, w.id) !== 'planned' || isPaused(state, w.date)) return null;
  const found = weatherReasons(forecast, w, profile, startHour);
  if (!found) return null;
  let actions: WeatherAction[];
  if (w.role === 'commute') actions = ['skip'];
  else {
    const indoor = indoorVersion(w);
    // Swims in a thunderstorm: the pool is still the answer; other sports likewise go indoors.
    actions = !indoor ? ['move'] : indoor.preferMove ? ['move', 'indoor'] : ['indoor', 'move'];
  }
  return { workoutId: w.id, reasons: found.reasons, from: found.from, actions };
}

/** Whether a day's forecast at the session hour would trigger a hint for this session. */
function badDay(
  forecast: WeatherForecast | null,
  w: Workout,
  date: string,
  profile: UserProfile,
  startHour: number,
): boolean {
  if (!forecast) return false;
  return weatherReasons(forecast, { ...w, date }, profile, startHour) !== null;
}

/**
 * "Move to another day": up to `moveOptions` days after today in this and the next week where
 * the move breaks no rule (no hard days back to back, availability) and the forecast – where it
 * reaches – is fine. Nearest first. The move itself goes through `moveWorkout`, so the week
 * rebalance suggestion comes with it.
 */
export function weatherMoveDays(
  state: PlanState,
  workoutId: string,
  input: PlanInput,
  today: string,
  forecast: WeatherForecast | null,
  startHour: number = cfg.defaultSessionHour,
): string[] {
  const w = findWorkout(state.plan, workoutId);
  if (!w) return [];
  const range = planRange(state.plan);
  const from = parseIsoDate(w.date) as number;
  const monday = from - weekdayOf(from);
  const candidates: string[] = [];
  for (let d = monday; d <= monday + 13; d++) {
    const iso = toIsoDate(d);
    if (iso === w.date || iso <= today || iso < range.first || iso > range.last) continue;
    candidates.push(iso);
  }
  // Stable sort: of two days equally far away, the earlier one comes first.
  candidates.sort(
    (a, b) =>
      Math.abs((parseIsoDate(a) as number) - from) - Math.abs((parseIsoDate(b) as number) - from),
  );
  const busy = new Set(
    allWorkouts(state.plan)
      .filter((o) => o.id !== w.id && o.role !== 'commute' && statusOf(state, o.id) !== 'skipped')
      .map((o) => o.date),
  );
  const result: string[] = [];
  for (const date of candidates) {
    if (result.length >= cfg.moveOptions) break;
    if (busy.has(date) && !input.availability.doublesAllowed) continue;
    if (badDay(forecast, w, date, input.profile, startHour)) continue;
    const moved = moveWorkout(state, w.id, date, input, today);
    if (moved.ok && moved.value.warnings.length === 0) result.push(date);
  }
  return result;
}
