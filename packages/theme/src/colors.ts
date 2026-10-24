/** Palette "Volt" – the only place in the repo where colour values are written down. */
export const colors = {
  volt: '#D4FF3A',
  voltPressed: '#BFE81F',
  ink: '#0B0D10',
  white: '#FFFFFF',
  dark: {
    bg: '#0B0D10',
    surface: '#14171C',
    surface2: '#1C2027',
    border: '#2A2F38',
    text: '#FFFFFF',
    textMuted: '#9AA3AE',
    accent: '#D4FF3A',
    onAccent: '#0B0D10',
  },
  light: {
    bg: '#FFFFFF',
    surface: '#F4F6EC',
    surface2: '#E9ECDF',
    border: '#DADFCE',
    text: '#0B0D10',
    textMuted: '#5A6270',
    accent: '#D4FF3A',
    onAccent: '#0B0D10',
  },
} as const;

/** Status colours for fills, icons and borders (and for text on dark backgrounds). */
export const status = {
  error: '#FF5A4E',
  warning: '#FFB020',
  info: '#5B8CFF',
} as const;

/**
 * Status colours used as text. On light backgrounds the base status colours are below 4.5:1
 * (error 3.08, warning 1.83, info 3.16 on white), so text uses darker variants there.
 */
export const statusText = {
  dark: { error: status.error, warning: status.warning, info: status.info },
  light: { error: '#B42318', warning: '#8A5300', info: '#2F5BD3' },
} as const;

/**
 * Heart-rate zone scale Z1…Z5. Steps differ in hue and lightness so they stay separable side by side.
 * Dark: Z2 is Volt. Light: Volt is never a line or mark on light backgrounds, so Z2 is a darker green.
 * Zones are always labelled as well – never rely on colour alone.
 */
export const zoneColors = {
  dark: ['#7A8CA8', '#D4FF3A', '#FFC94A', '#FF8A3D', '#FF4F6B'],
  light: ['#7488A6', '#5A8700', '#B07400', '#CC4A0C', '#A01030'],
} as const satisfies Record<'dark' | 'light', readonly [string, string, string, string, string]>;

/**
 * Workout type scale (CLAUDE.md "UI patterns"): the bar on every workout card, the dot under a day
 * and the tint of the workout header. Each type is ≥ 3:1 against bg/surface/surface2, separable
 * from every other type and from Volt in OKLab (hue and lightness), and always named in text too.
 */
export const workoutTypeColors = {
  dark: {
    easy: '#5CB8FF',
    long: '#6F73F2',
    tempo: '#FFB547',
    intervals: '#FF4F4F',
    hills: '#C9895B',
    test: '#F472D0',
    strength: '#D2A6FF',
    cross: '#D3DCE6',
    commute: '#3FD69B',
  },
  light: {
    easy: '#1F78C8',
    long: '#2F2A9C',
    tempo: '#B86E00',
    intervals: '#C81E1E',
    hills: '#6B3A1E',
    test: '#B0258F',
    strength: '#8A4FE0',
    cross: '#4A5868',
    commute: '#0E7A55',
  },
} as const;

export type WorkoutTypeKey = keyof (typeof workoutTypeColors)['dark'];
export type WorkoutTypeColorKey = `type${Capitalize<WorkoutTypeKey>}`;

/**
 * Workout colour per sport (calendar card stripe and marker). Distinct from each other and from
 * Volt; ≥ 3:1 against bg and surface. Cards always show the sport as text too.
 */
export const sportColors = {
  dark: {
    run: '#FF7A59',
    bike: '#4FC3F7',
    swim: '#2DD4BF',
    strength: '#B794F6',
    brick: '#F472B6',
    winter: '#E2E8F0',
    commute: '#7DD68A',
  },
  light: {
    run: '#C2410C',
    bike: '#0369A1',
    swim: '#0F766E',
    strength: '#6D28D9',
    brick: '#BE185D',
    winter: '#334155',
    commute: '#2F7A3A',
  },
} as const;

export type SportColorKey = keyof (typeof sportColors)['dark'];

/**
 * Sleep stages (Insights → Health → Sleep): the segments of the stages bar. Deep and light sleep
 * share a hue and differ in lightness; every stage is ≥ 3:1 against bg and surface, none is Volt,
 * and each segment is labelled with its name and minutes.
 */
export const sleepStageColors = {
  dark: { deep: '#3E63DD', light: '#7CB7FF', rem: '#B58CFF', awake: '#FF9F7A' },
  light: { deep: '#1E3A8A', light: '#2F6FD0', rem: '#7A3FC9', awake: '#B5471B' },
} as const;

export type SleepStageKey = keyof (typeof sleepStageColors)['dark'];

export type ColorScheme = 'dark' | 'light';
export type ZoneNumber = 1 | 2 | 3 | 4 | 5;

export function zoneColor(scheme: ColorScheme, zone: ZoneNumber): string {
  return zoneColors[scheme][zone - 1] as string;
}

/** Semantic colours for one scheme – what UI code uses. */
export interface SchemeColors extends Record<WorkoutTypeColorKey, string> {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentPressed: string;
  /** Accent for lines, borders, text and small marks: Volt on dark, Ink on light (never Volt on light). */
  accentLine: string;
  onAccent: string;
  error: string;
  warning: string;
  info: string;
  errorText: string;
  warningText: string;
  infoText: string;
  zone1: string;
  zone2: string;
  zone3: string;
  zone4: string;
  zone5: string;
  sportRun: string;
  sportBike: string;
  sportSwim: string;
  sportStrength: string;
  sportBrick: string;
  sportWinter: string;
  sportCommute: string;
  sleepDeep: string;
  sleepLight: string;
  sleepRem: string;
  sleepAwake: string;
}

function typeTokens(name: ColorScheme): Record<WorkoutTypeColorKey, string> {
  const out = {} as Record<WorkoutTypeColorKey, string>;
  for (const [type, value] of Object.entries(workoutTypeColors[name])) {
    out[`type${type.charAt(0).toUpperCase()}${type.slice(1)}` as WorkoutTypeColorKey] = value;
  }
  return out;
}

function scheme(name: ColorScheme): SchemeColors {
  const [zone1, zone2, zone3, zone4, zone5] = zoneColors[name];
  const sport = sportColors[name];
  return {
    ...typeTokens(name),
    ...colors[name],
    accentPressed: colors.voltPressed,
    accentLine: name === 'dark' ? colors.volt : colors.ink,
    ...status,
    errorText: statusText[name].error,
    warningText: statusText[name].warning,
    infoText: statusText[name].info,
    zone1,
    zone2,
    zone3,
    zone4,
    zone5,
    sportRun: sport.run,
    sportBike: sport.bike,
    sportSwim: sport.swim,
    sportStrength: sport.strength,
    sportBrick: sport.brick,
    sportWinter: sport.winter,
    sportCommute: sport.commute,
    sleepDeep: sleepStageColors[name].deep,
    sleepLight: sleepStageColors[name].light,
    sleepRem: sleepStageColors[name].rem,
    sleepAwake: sleepStageColors[name].awake,
  };
}

export const schemes: Record<ColorScheme, SchemeColors> = {
  dark: scheme('dark'),
  light: scheme('light'),
};
