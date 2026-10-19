import {
  kindKey,
  workoutKind,
  type KindCategory,
  type KindSport,
  type Workout,
  type WorkoutKind,
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

export function kindIcon(kind: WorkoutKind): IconName {
  return CATEGORY_ICON[kind.category];
}

export function kindColor(colors: ThemeColors, kind: WorkoutKind): string {
  return colors[SPORT_COLOR[kind.sport]];
}

export function kindName(t: TFunction, kind: WorkoutKind): string {
  return t(`workoutTypes.kinds.${kindKey(kind)}.name` as never) as string;
}

/** The general name shown in the calendar, e.g. "Easy run" for an easy run with strides. */
export function calendarTitle(t: TFunction, w: Workout): string {
  return kindName(t, workoutKind(w));
}
