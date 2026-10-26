import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, numeric, spacing, Text } from '@/ui';

/** Clearly invented numbers for the locked previews – never user data. */
export const SAMPLE_ENERGY = { remaining: 640, workouts: 420, eaten: 1580, target: 2220 };
const SAMPLE_MEALS = [
  { meal: 'breakfast', name: 'Oats with berries', kcal: 420 },
  { meal: 'lunch', name: 'Chicken rice bowl', kcal: 690 },
  { meal: 'snack', name: 'Greek yogurt', kcal: 160 },
] as const;

export function SampleEnergy() {
  const { t } = useTranslation();
  return (
    <Card style={styles.card}>
      <Text variant="title" style={numeric}>
        {t('bodyAddon.energy.remaining', { kcal: SAMPLE_ENERGY.remaining })}
      </Text>
      <Text tone="secondary" style={numeric}>
        {t('bodyAddon.energy.fromWorkouts', { kcal: SAMPLE_ENERGY.workouts })}
      </Text>
    </Card>
  );
}

export function SampleDiary() {
  const { t } = useTranslation();
  return (
    <Card style={styles.card}>
      <SampleEnergy />
      {SAMPLE_MEALS.map((m) => (
        <View key={m.name} style={styles.row}>
          <Text tone="secondary" style={styles.meal}>
            {t(`bodyAddon.meals.${m.meal}`)}
          </Text>
          <Text style={styles.flex}>{m.name}</Text>
          <Text style={numeric}>{t('bodyAddon.kcal', { kcal: m.kcal })}</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  meal: { width: 88 },
  flex: { flex: 1 },
});
