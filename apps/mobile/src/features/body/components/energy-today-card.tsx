import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useEntitlement } from '@/features/billing/billing-store';
import { Button, Card, Icon, numeric, spacing, Text, useTheme } from '@/ui';

import { useEnergyToday } from '../queries';
import { BlurredSample } from './locked-preview';
import { SampleEnergy } from './sample';

/**
 * "Energy today" on the Today screen: what is left of today's target and the energy of today's
 * workouts. Hidden while the add-on is switched off; locked it shows a blurred sample and the way
 * to the add-on paywall. Today never depends on it – the card only adds.
 */
export function EnergyTodayCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const guard = useEntitlement('body_nutrition');
  const energy = useEnergyToday();
  if (!guard.visible || guard.state === 'pending') return null;

  if (!guard.canRead) {
    return (
      <Card style={styles.card} testID="energy-today-locked">
        <Text variant="heading">{t('bodyAddon.energy.title')}</Text>
        <BlurredSample>
          <SampleEnergy />
        </BlurredSample>
        <Button
          small
          variant="secondary"
          label={t('bodyAddon.unlock')}
          onPress={() => router.push('/body/addon')}
        />
      </Card>
    );
  }

  return (
    <Card style={styles.card} testID="energy-today">
      <View style={styles.row}>
        <Icon name="bolt" size={20} color={colors.textMuted} />
        <Text variant="heading" style={styles.flex}>
          {t('bodyAddon.energy.title')}
        </Text>
      </View>
      {energy ? (
        <>
          <Text variant="title" style={numeric}>
            {energy.remainingKcal >= 0
              ? t('bodyAddon.energy.remaining', { kcal: energy.remainingKcal })
              : t('bodyAddon.energy.over', { kcal: -energy.remainingKcal })}
          </Text>
          <Text tone="secondary" style={numeric}>
            {t('bodyAddon.energy.fromWorkouts', { kcal: energy.workoutKcal })}
          </Text>
          <Text variant="caption" tone="secondary">
            {t('bodyAddon.energy.estimate')}
          </Text>
        </>
      ) : (
        <Text tone="secondary">{t('bodyAddon.energy.setUp')}</Text>
      )}
      <Button
        small
        variant="secondary"
        label={t('bodyAddon.energy.open')}
        onPress={() => router.push('/body')}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
