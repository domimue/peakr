import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, spacing, Text } from '@/ui';

import { useBillingStore } from '../billing-store';
import type { ActiveSubscription } from '../model';

function formatDate(iso: string | null, locale: string, fallback: string): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Profile → Subscription (CLAUDE.md "Monetisation"): the training tier and the Gym add-on side by
 * side – period, price, next billing date or trial end – each with its own manage/cancel link, so
 * one can be cancelled without touching the other. Store purchases open the store's page for that
 * exact subscription; web (Stripe) subscriptions are managed on the website, never linked from
 * here (store rules).
 */
export function SubscriptionScreen() {
  const { t, i18n } = useTranslation();
  const subscriptions = useBillingStore((s) => s.subscriptions);
  const devGym = useBillingStore((s) => s.devGym);
  const tier = subscriptions.find((s) => s.kind === 'tier');
  const addon = subscriptions.find((s) => s.kind === 'gym');

  return (
    <Screen title={t('subscription.title')}>
      <Text tone="secondary">{t('subscription.intro')}</Text>

      <Section
        title={t('subscription.tierTitle')}
        subscription={tier}
        name={tier ? t(`subscription.tierNames.${tier.entitlement as 'training' | 'plus'}`) : ''}
        locale={i18n.language}
      />
      <Section
        title={t('subscription.addonTitle')}
        subscription={addon}
        name={t('gymAddon.title')}
        locale={i18n.language}
        action={
          addon || devGym ? null : (
            <Button label={t('subscription.getAddon')} onPress={() => router.push('/gym/addon')} />
          )
        }
      />
    </Screen>
  );
}

function Section({
  title,
  subscription,
  name,
  locale,
  action,
}: {
  title: string;
  subscription: ActiveSubscription | undefined;
  name: string;
  locale: string;
  action?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const dash = t('subscription.unknownDate');
  if (!subscription) {
    return (
      <Card style={styles.card} testID={`subscription-${title}`}>
        <Text variant="heading">{title}</Text>
        <Text tone="secondary">{t('subscription.none')}</Text>
        {action}
      </Card>
    );
  }
  const date = formatDate(subscription.expiresAt, locale, dash);
  const dateLabel = !subscription.willRenew
    ? t('subscription.endsOn')
    : subscription.isTrial
      ? t('subscription.trialEnds')
      : t('subscription.nextBilling');
  const store = t(`subscription.store.${subscription.store}`);
  const rows: [string, string][] = [
    [t(`subscription.period.${subscription.period ?? 'monthly'}`), name],
    ...(subscription.priceString
      ? [[t('subscription.price'), subscription.priceString] as [string, string]]
      : []),
    [dateLabel, date],
    ...(subscription.isTrial ? [[t('subscription.trial'), '✓'] as [string, string]] : []),
  ];
  return (
    <Card style={styles.card} testID={`subscription-${subscription.kind}`}>
      <Text variant="heading">{title}</Text>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text tone="secondary" style={styles.flex}>
            {label}
          </Text>
          <Text style={styles.number}>{value}</Text>
        </View>
      ))}
      {!subscription.willRenew ? (
        <Text variant="caption" tone="secondary">
          {t('subscription.cancelledNote')}
        </Text>
      ) : null}
      {subscription.store === 'stripe' ? (
        <Text variant="caption" tone="secondary">
          {t('subscription.manageOnWeb')}
        </Text>
      ) : subscription.managementUrl ? (
        <>
          <Button
            variant="secondary"
            label={t('subscription.manage')}
            onPress={() => void Linking.openURL(subscription.managementUrl as string)}
          />
          <Text variant="caption" tone="secondary">
            {t('subscription.cancelOnly', { store })}
          </Text>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  number: { fontVariant: ['tabular-nums'] },
});
