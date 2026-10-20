import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, Screen, spacing, Text, useTheme, type IconName } from '@/ui';

/** Features of later phases: linked from where they will live, never hidden. */
export const COMING_SOON_TOPICS = [
  'routes',
  'linkActivity',
  'addSession',
  'units',
  'notifications',
  'language',
  'connections',
  'subscription',
  'account',
  'privacy',
] as const;

export type ComingSoonTopic = (typeof COMING_SOON_TOPICS)[number];

const ICON: Record<ComingSoonTopic, IconName> = {
  routes: 'route',
  linkActivity: 'link',
  addSession: 'plus',
  units: 'units',
  notifications: 'bell',
  language: 'language',
  connections: 'connections',
  subscription: 'subscription',
  account: 'account',
  privacy: 'privacy',
};

export function isComingSoonTopic(value: string | undefined): value is ComingSoonTopic {
  return COMING_SOON_TOPICS.includes(value as ComingSoonTopic);
}

export function ComingSoonScreen({ topic }: { topic: ComingSoonTopic }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Screen title={t(`comingSoon.topics.${topic}.title`)}>
      <View style={styles.badge}>
        <Icon name={ICON[topic]} size={40} color={colors.textMuted} />
        <Text variant="label">{t('comingSoon.label')}</Text>
      </View>
      <Text>{t(`comingSoon.topics.${topic}.body`)}</Text>
      <Text tone="secondary">{t('comingSoon.hint')}</Text>
      <Button variant="secondary" label={t('common.back')} onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
});
