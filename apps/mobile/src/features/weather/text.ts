import type { WeatherCondition, WeatherReason } from '@peakr/engine';
import type { TFunction } from 'i18next';

import type { IconName } from '@/ui';

const CONDITION_ICONS: Record<WeatherCondition, IconName> = {
  clear: 'wxClear',
  partlyCloudy: 'wxPartlyCloudy',
  cloudy: 'wxCloudy',
  fog: 'wxFog',
  drizzle: 'wxDrizzle',
  rain: 'wxRain',
  snow: 'wxSnow',
  freezingRain: 'wxFreezingRain',
  thunderstorm: 'wxThunderstorm',
};

const REASON_ICONS: Record<WeatherReason, IconName> = {
  thunderstorm: 'wxThunderstorm',
  ice: 'wxFreezingRain',
  storm: 'wind',
  snow: 'wxSnow',
  heavyRain: 'wxRain',
};

export const conditionIcon = (c: WeatherCondition): IconName => CONDITION_ICONS[c];
export const reasonIcon = (r: WeatherReason): IconName => REASON_ICONS[r];

/** `2026-10-20T18:00` → "18:00" in the user's locale. */
export function hourText(time: string, language: string): string {
  const [date, clock] = time.split('T');
  const [h, m] = (clock ?? '00:00').split(':').map(Number);
  const [y, mo, d] = (date ?? '').split('-').map(Number);
  return new Date(y ?? 2000, (mo ?? 1) - 1, d ?? 1, h ?? 0, m ?? 0).toLocaleTimeString(language, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "Heavy rain expected from 18:00" (the most severe reason leads). */
export function hintTitle(
  t: TFunction,
  reasons: readonly WeatherReason[],
  time: string,
  language: string,
) {
  const first = reasons[0] ?? 'heavyRain';
  return t(`weather.reason.${first}.title`, { time: hourText(time, language) });
}

/** "Also: strong gusts, snowfall" – or null when there is only one reason. */
export function otherReasons(t: TFunction, reasons: readonly WeatherReason[]): string | null {
  if (reasons.length < 2) return null;
  return t('weather.hint.also', {
    list: reasons
      .slice(1)
      .map((r) => t(`weather.reason.${r}.short`))
      .join(', '),
  });
}
