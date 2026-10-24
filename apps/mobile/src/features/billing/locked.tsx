import { router } from 'expo-router';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Button, Card, ListState, Screen, spacing, Text } from '@/ui';

import { useAccess } from './billing-store';
import type { Access } from './model';

/**
 * What a screen shows instead of a training feature without an active subscription (CLAUDE.md
 * "Monetisation", no free tier): `preview` – start the trial; `readOnly` – the subscription ended,
 * the plan stays readable. Both lead to the in-app paywall, never to the web checkout.
 */
export function LockedCard({ access, testID }: { access: Access; testID?: string }) {
  const { t } = useTranslation();
  if (access === 'pending') return <ListState kind="loading" label={t('common.loading')} />;
  const key = access === 'readOnly' ? 'readOnly' : 'preview';
  return (
    <Card style={styles.card} testID={testID ?? 'locked-card'}>
      <Text variant="heading">{t(`locked.${key}.title`)}</Text>
      <Text tone="secondary">{t(`locked.${key}.body`)}</Text>
      <Button label={t(`locked.${key}.action`)} onPress={() => router.push('/paywall')} />
    </Card>
  );
}

/**
 * Route wrapper for a training feature: renders the screen with `full` access (or `readOnly`
 * when the screen only shows things), the locked card otherwise.
 */
export function withTraining<P extends object>(
  Component: ComponentType<P>,
  options: { allowReadOnly?: boolean } = {},
): ComponentType<P> {
  function Gated(props: P) {
    const access = useAccess();
    if (access === 'full' || (options.allowReadOnly && access === 'readOnly')) {
      return <Component {...props} />;
    }
    return (
      <Screen>
        <LockedCard access={access} />
      </Screen>
    );
  }
  Gated.displayName = `withTraining(${Component.displayName ?? Component.name})`;
  return Gated;
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
});
