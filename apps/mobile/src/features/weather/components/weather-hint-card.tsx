import { indoorVersion, type Workout } from '@peakr/engine';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, ChipGroup, Icon, spacing, Text, useTheme } from '@/ui';

import { formatDate } from '../../plan/calendar';
import { useDismissedHints, type WorkoutWeather } from '../queries';
import { hintTitle, otherReasons, reasonIcon } from '../text';

export interface WeatherHintCardProps {
  workout: Workout;
  weather: WorkoutWeather;
  /** Switch to the indoor version; omitted when it is already shown. */
  onIndoor?: () => void;
  onMove: (date: string) => void;
  /** No clean day found: open the full day picker. */
  onPickDay: () => void;
  onSkip: () => void;
}

/**
 * Weather hint on the day's workout: what is expected at the session time and the options –
 * indoor version of equivalent load, move to another day (with the week rebalance), skip a
 * commute, or keep it outdoors. The user decides; nothing changes on its own.
 */
export function WeatherHintCard({
  workout,
  weather,
  onIndoor,
  onMove,
  onPickDay,
  onSkip,
}: WeatherHintCardProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const dismiss = useDismissedHints((s) => s.dismiss);
  const { hint, moveDays } = weather;
  const indoor = indoorVersion(workout);
  const also = otherReasons(t, hint.reasons);

  const options = hint.actions.map((action) => {
    if (action === 'indoor') {
      if (!indoor || !onIndoor) return null;
      return (
        <Button
          key="indoor"
          variant="secondary"
          icon="indoor"
          label={t('weather.hint.indoor', { kind: t(`workout.indoor.${indoor.kind}`) })}
          onPress={onIndoor}
        />
      );
    }
    if (action === 'skip') {
      return (
        <Button
          key="skip"
          variant="secondary"
          icon="skip"
          label={t('plan.realLife.skipCommute')}
          onPress={onSkip}
        />
      );
    }
    return moveDays.length > 0 ? (
      <ChipGroup
        key="move"
        label={t('weather.hint.moveTo')}
        options={moveDays.map((d) => ({
          value: d,
          label: formatDate(d, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' }),
        }))}
        selected={[]}
        onToggle={onMove}
      />
    ) : (
      <Button
        key="move"
        variant="secondary"
        icon="move"
        label={t('weather.hint.pickDay')}
        onPress={onPickDay}
      />
    );
  });

  return (
    <Card testID={`weather-hint-${workout.id}`}>
      <View style={styles.inline}>
        <Icon name={reasonIcon(hint.reasons[0] ?? 'heavyRain')} size={22} color={colors.warning} />
        <View style={styles.flex}>
          <Text style={styles.strong} accessibilityRole="header">
            {hintTitle(t, hint.reasons, hint.from, i18n.language)}
          </Text>
          {also ? (
            <Text variant="caption" tone="secondary">
              {also}
            </Text>
          ) : null}
        </View>
      </View>
      {indoor?.preferMove && hint.actions[0] === 'move' ? (
        <Text variant="caption" tone="secondary">
          {t('weather.hint.preferMove')}
        </Text>
      ) : null}
      <Text variant="caption" tone="secondary">
        {t('weather.hint.yourCall')}
      </Text>
      <View style={styles.options}>{options}</View>
      <Button
        small
        variant="secondary"
        icon="outdoor"
        label={t('weather.hint.keepOutdoors')}
        onPress={() => dismiss(workout.id)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  strong: { fontWeight: '600' },
  options: { gap: spacing.sm },
});
