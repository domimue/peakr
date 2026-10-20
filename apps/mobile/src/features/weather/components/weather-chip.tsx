import { forecastAt, weatherCondition } from '@peakr/engine';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { Icon, radius, spacing, Text, useTheme, type IconName } from '@/ui';

import { useForecast, useWeatherSettings } from '../queries';
import { conditionIcon, hourText } from '../text';

/**
 * Weather chip in the Today header: condition icon and temperature at the planned session time
 * (the user's usual training hour). Off, without a location or without data it says so and opens
 * the weather settings.
 */
export function WeatherChip({ date }: { date: string }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { data: settings } = useWeatherSettings();
  const { data: forecast, isError } = useForecast();
  if (!settings) return null;

  let icon: IconName = 'weather';
  let label: string;
  let a11y: string | null = null;
  if (forecast?.status === 'off') label = t('weather.chip.off');
  else if (forecast?.status === 'noLocation') label = t('weather.chip.noLocation');
  else if (isError) label = t('weather.chip.unavailable');
  else if (!forecast) label = t('weather.chip.loading');
  else {
    const hour = forecastAt(forecast.forecast, date, settings.sessionHour);
    if (!hour || hour.temperatureC === null) label = t('weather.chip.noData');
    else {
      const condition = weatherCondition(hour);
      icon = conditionIcon(condition);
      const time = hourText(hour.time, i18n.language);
      const temp = Math.round(hour.temperatureC);
      label = t('weather.chip.value', { time, temp });
      a11y = t('weather.chip.a11y', {
        time,
        temp,
        condition: t(`weather.condition.${condition}`),
      });
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityHint={t('weather.chip.hint')}
      onPress={() => router.push('/training/weather')}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: colors.border, backgroundColor: pressed ? colors.surface2 : undefined },
      ]}
      testID="weather-chip"
    >
      <Icon name={icon} size={16} color={a11y ? colors.text : colors.textMuted} />
      <Text variant="caption" tone={a11y ? 'default' : 'secondary'} style={styles.figures}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  figures: { fontVariant: ['tabular-nums'] },
});
