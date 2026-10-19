import {
  kindKey,
  kindWorkoutType,
  typeColorKey,
  workoutKind,
  type KindCategory,
  type KindSport,
  type Workout,
  type WorkoutKind,
  type WorkoutType,
} from '@peakr/engine';
import type { TFunction } from 'i18next';

import type { IconName, ThemeColors } from '@/ui';

/** Calendar names, icons and colours of workout kinds ("Easy run", "Intervals" …). */

const CATEGORY_ICON: Record<KindCategory, IconName> = {
  easy: 'easy',
  long: 'long',
  tempo: 'tempo',
  threshold: 'threshold',
  intervals: 'intervals',
  hills: 'hills',
  technique: 'technique',
  speed: 'speed',
  openwater: 'openwater',
  test: 'test',
  strength: 'strength',
  brick: 'brick',
  commute: 'commute',
};

export const SPORT_ICON: Record<KindSport, IconName> = {
  run: 'run',
  bike: 'bike',
  swim: 'swim',
  strength: 'strength',
  brick: 'brick',
  winter: 'winter',
  commute: 'commute',
};

const SPORT_COLOR: Record<KindSport, keyof ThemeColors> = {
  run: 'sportRun',
  bike: 'sportBike',
  swim: 'sportSwim',
  strength: 'sportStrength',
  brick: 'sportBrick',
  winter: 'sportWinter',
  commute: 'sportCommute',
};

/** Type colour of a workout (bar, dot, header tint) – never Volt, always named in text too. */
export function typeColor(colors: ThemeColors, w: Pick<Workout, 'colorKey'>): string {
  return colors[w.colorKey];
}

/** Name of the workout type ("Easy", "Intervals", …) shown next to every type colour. */
export function typeName(t: TFunction, type: WorkoutType): string {
  return t(`workoutTypes.types.${type}`);
}

export function kindIcon(kind: WorkoutKind): IconName {
  return CATEGORY_ICON[kind.category];
}

/** Type colour of a kind (the same colour its workouts carry). */
export function kindColor(colors: ThemeColors, kind: WorkoutKind): string {
  return colors[typeColorKey(kindWorkoutType(kind))];
}

/** Sport colour – for sport icons only; workout cards use the type colour. */
export function sportKindColor(colors: ThemeColors, sport: KindSport): string {
  return colors[SPORT_COLOR[sport]];
}

export function kindName(t: TFunction, kind: WorkoutKind): string {
  return t(`workoutTypes.kinds.${kindKey(kind)}.name` as never) as string;
}

/** The general name shown in the calendar, e.g. "Easy run" for an easy run with strides. */
export function calendarTitle(t: TFunction, w: Workout): string {
  return kindName(t, workoutKind(w));
}
