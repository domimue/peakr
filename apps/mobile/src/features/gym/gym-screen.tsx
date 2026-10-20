import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Card,
  IconBadge,
  Screen,
  SettingsGroup,
  SettingsRow,
  spacing,
  Text,
  useTheme,
  type IconName,
} from '@/ui';

/** What the Gym add-on will contain (CLAUDE.md "Gym"), shown as a preview until it ships. */
const FEATURES: readonly { key: string; icon: IconName }[] = [
  { key: 'library', icon: 'book' },
  { key: 'routines', icon: 'structure' },
  { key: 'session', icon: 'intervals' },
  { key: 'history', icon: 'trophy' },
];

/**
 * Gym tab: placeholder until the strength workspace (Phases 8d–8f). It previews the add-on rather
 * than hiding the tab, and links to what already exists – own routines and the quick log.
 */
export function GymScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Screen title={t('gym.title')}>
      <Card style={styles.preview} testID="gym-preview">
        <View style={styles.head}>
          <Text variant="heading" style={styles.flex}>
            {t('gym.previewTitle')}
          </Text>
          <Badge label={t('comingSoon.label')} />
        </View>
        <Text tone="secondary">{t('gym.previewBody')}</Text>
        {FEATURES.map(({ key, icon }) => (
          <View key={key} style={styles.feature}>
            <IconBadge name={icon} color={colors.typeStrength} size={32} />
            <View style={styles.flex}>
              <Text variant="label">{t(`gym.features.${key}.title` as never)}</Text>
              <Text variant="caption" tone="secondary">
                {t(`gym.features.${key}.body` as never)}
              </Text>
            </View>
          </View>
        ))}
      </Card>
      <SettingsGroup title={t('gym.availableNow')}>
        <SettingsRow
          icon="structure"
          title={t('strength.routines.title')}
          onPress={() => router.push('/strength/routines')}
        />
        <SettingsRow
          icon="sessions"
          title={t('strength.quickLog.title')}
          onPress={() => router.push('/strength/quick-log')}
        />
      </SettingsGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
});
