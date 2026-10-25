import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { legalLinks } from '@/features/billing/links';
import { Card, LinkRow, Screen, Text } from '@/ui';

/**
 * Profile → Privacy: what is stored and where, with the ways to control it – connections, health
 * data, notifications, the privacy policy and deleting the account.
 */
export function PrivacyScreen() {
  const { t } = useTranslation();
  const policy = legalLinks?.privacy ?? null;
  return (
    <Screen>
      <Card>
        <Text variant="label">{t('settings.privacy.storedTitle')}</Text>
        <Text>{t('settings.privacy.stored')}</Text>
        <Text tone="secondary">{t('settings.privacy.never')}</Text>
      </Card>
      <LinkRow
        icon="connections"
        title={t('profile.connections')}
        hint={t('settings.privacy.connections')}
        onPress={() => router.push('/integrations')}
      />
      <LinkRow
        icon="heart"
        title={t('settings.privacy.health')}
        hint={t('settings.privacy.healthHint')}
        onPress={() => router.push('/health/consent')}
      />
      <LinkRow
        icon="bell"
        title={t('profile.notifications')}
        hint={t('settings.privacy.notifications')}
        onPress={() => router.push('/settings/notifications')}
      />
      {policy ? (
        <LinkRow
          icon="book"
          title={t('settings.privacy.policy')}
          onPress={() => void Linking.openURL(policy)}
        />
      ) : null}
      <LinkRow
        icon="trash"
        title={t('settings.privacy.delete')}
        hint={t('settings.privacy.deleteHint')}
        onPress={() => router.push('/auth/account')}
      />
    </Screen>
  );
}
