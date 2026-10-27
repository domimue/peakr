import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { IconButton, spacing, Text } from '@/ui';

/**
 * The way into Profile and Settings (CLAUDE.md "UI patterns → Navigation"): an icon top right on
 * every screen – Profile is no tab of its own.
 */
export function ProfileButton() {
  const { t } = useTranslation();
  return (
    <IconButton
      icon="profile"
      accessibilityLabel={t('profile.open')}
      onPress={() => router.push('/profile')}
    />
  );
}

/** Title row of a tab screen: the title (and optional line below it) left, the profile icon right. */
export function TabTitle({ title, above }: { title: string; above?: ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        {above}
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
      </View>
      <ProfileButton />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
