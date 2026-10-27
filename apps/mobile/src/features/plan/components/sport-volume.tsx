import type { SportVolume, WeekProgress } from '@peakr/engine';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { Units } from '@/features/settings/app-settings';
import { KM_PER_MILE, useUnits } from '@/features/settings/units';
import { numeric, spacing, Text, useTheme, type ThemeColors } from '@/ui';

const YARDS_PER_M = 1.0936133;

/** "3 h 10" / "45 min". */
export function minutesText(t: TFunction, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? t('progress.hoursMinutes', { h, m }) : t('workoutText.minutes', { count: m });
}

/** Done / planned of one sport in its own unit: "18 / 29 km", "1,500 / 2,400 m", "1 / 2". */
export function volumeText(t: TFunction, units: Units, v: SportVolume): string {
  if (v.unit === 'sessions') return t('plan.volume.sessions', { done: v.done, planned: v.planned });
  if (v.unit === 'm') {
    const imperial = units === 'imperial';
    const f = imperial ? YARDS_PER_M : 1;
    const step = (x: number) => Math.round((x * f) / 50) * 50;
    return t(imperial ? 'plan.volume.yd' : 'plan.volume.m', {
      done: step(v.done),
      planned: step(v.planned),
    });
  }
  const f = units === 'imperial' ? 1 / KM_PER_MILE : 1;
  const one = (x: number) => Math.round(x * f * 10) / 10;
  return t(units === 'imperial' ? 'plan.volume.mi' : 'plan.volume.km', {
    done: one(v.done),
    planned: one(v.planned),
  });
}

const SPORT_COLOR: Record<SportVolume['sport'], keyof ThemeColors> = {
  run: 'sportRun',
  bike: 'sportBike',
  swim: 'sportSwim',
  strength: 'sportStrength',
};

/**
 * A week's volume (CLAUDE.md "UI patterns → Plan"): time is the one figure across sports;
 * distances are never added up across sports – one line per selected sport in its colour, run
 * and ride in km, swims in metres, strength in sessions. With one endurance sport only its
 * distance is shown.
 */
export function SportVolumeLines({
  progress,
  testID,
}: {
  progress: WeekProgress;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { units } = useUnits();
  const { colors } = useTheme();
  const time = t('plan.volume.time', {
    done: minutesText(t, progress.minutesDone),
    planned: minutesText(t, progress.minutesPlanned),
  });
  const endurance = progress.bySport.filter((v) => v.unit !== 'sessions');
  if (endurance.length <= 1) {
    const [only] = endurance;
    return (
      <View style={styles.stack} testID={testID}>
        <Text variant="caption" style={numeric}>
          {time}
        </Text>
        {only && only.planned > 0 ? (
          <Text variant="caption" style={numeric}>
            {t('plan.volume.distance', { value: volumeText(t, units, only) })}
          </Text>
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.stack} testID={testID}>
      <Text variant="caption" style={[numeric, styles.strong]}>
        {time}
      </Text>
      {progress.bySport.map((v) => (
        <View key={v.sport} style={styles.row}>
          <View style={[styles.swatch, { backgroundColor: colors[SPORT_COLOR[v.sport]] }]} />
          <Text
            variant="caption"
            style={numeric}
            testID={testID ? `${testID}-${v.sport}` : undefined}
          >
            {`${t(`plan.volume.sport.${v.sport}`)} ${volumeText(t, units, v)}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** One-line form for Today and accessibility labels: "Running 18 / 29 km · Riding 40 / 60 km". */
export function volumeLine(t: TFunction, units: Units, progress: WeekProgress): string {
  const endurance = progress.bySport.filter((v) => v.unit !== 'sessions');
  if (endurance.length <= 1) {
    const [only] = endurance;
    return only && only.planned > 0 ? volumeText(t, units, only) : '';
  }
  return progress.bySport
    .map((v) => `${t(`plan.volume.sport.${v.sport}`)} ${volumeText(t, units, v)}`)
    .join(' · ');
}

const styles = StyleSheet.create({
  stack: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 8, height: 8, borderRadius: 4 },
  strong: { fontWeight: '600' },
});
