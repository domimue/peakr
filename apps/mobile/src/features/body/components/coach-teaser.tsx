import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useEntitlement } from '@/features/billing/billing-store';
import { Button, Card, Icon, spacing, Text, useTheme } from '@/ui';

/**
 * A short coach teaser below Teil A's weekly summary, for users without the Body add-on. It only
 * adds: hidden while the add-on is switched off, while billing loads and once the add-on is
 * active. Leads to the add-on paywall – never a hidden or broken screen.
 */
export function CoachTeaser() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const guard = useEntitlement('body_nutrition');
  if (!guard.visible || guard.state === 'pending' || guard.canWrite) return null;
  return (
    <Card style={styles.card} testID="coach-teaser">
      <View style={styles.row}>
        <Icon name="sparkles" size={20} color={colors.textMuted} />
        <Text variant="label" style={styles.flex}>
          {t('bodyAddon.coach.teaser.title')}
        </Text>
      </View>
      <Text tone="secondary">{t('bodyAddon.coach.teaser.body')}</Text>
      <Button
        small
        variant="secondary"
        label={t('bodyAddon.coach.teaser.action')}
        onPress={() => router.push('/body/addon')}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
