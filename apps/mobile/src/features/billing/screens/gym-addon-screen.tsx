import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Button, Card, Screen, SegmentedControl, spacing, Text } from '@/ui';

import { useBillingStore } from '../billing-store';

/**
 * Paywall of the Gym add-on (entitlement `gym`): its own subscription, monthly or yearly, 7-day
 * trial with payment details upfront – like the tiers, but independent of them. Prices come from
 * the store through RevenueCat, never from this file.
 */
export function GymAddonScreen() {
  const { t } = useTranslation();
  const status = useBillingStore((s) => s.status);
  const packages = useBillingStore((s) => s.gymPackages);
  const hasGym = useBillingStore((s) => s.entitlements.gym || s.devGym);
  const buyGym = useBillingStore((s) => s.buyGym);
  const restore = useBillingStore((s) => s.restore);
  const setDevGym = useBillingStore((s) => s.setDevGym);
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = packages.find((p) => p.period === period) ?? packages[0];
  const withTrial = selected?.trialDays !== null && selected?.trialDays !== undefined;

  const buy = async () => {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    const result = await buyGym(selected.id);
    setBusy(false);
    if (result === 'purchased') router.replace('/gym');
    else if (result === 'error') setMessage(t('gymAddon.paywall.failed'));
  };

  const doRestore = async () => {
    setBusy(true);
    const ok = await restore();
    setBusy(false);
    setMessage(t(ok ? 'gymAddon.paywall.restored' : 'gymAddon.paywall.restoreFailed'));
  };

  return (
    <Screen title={t('gymAddon.paywall.title')}>
      <Text tone="secondary">{t('gymAddon.tagline')}</Text>
      <Text variant="caption" tone="secondary">
        {t('gymAddon.paywall.independent')}
      </Text>

      {hasGym ? (
        <Card>
          <Text variant="heading">{t('gymAddon.paywall.active')}</Text>
          <Button
            variant="secondary"
            label={t('gymAddon.paywall.manage')}
            onPress={() => router.push('/subscription')}
          />
        </Card>
      ) : status === 'unavailable' ? (
        <Card>
          <Text>{t('gymAddon.paywall.unavailable')}</Text>
        </Card>
      ) : packages.length === 0 ? (
        <Text tone="secondary">{t('gymAddon.paywall.loading')}</Text>
      ) : (
        <>
          <SegmentedControl
            options={[
              { value: 'monthly', label: t('gymAddon.paywall.monthly') },
              { value: 'yearly', label: t('gymAddon.paywall.yearly') },
            ]}
            value={period}
            onChange={setPeriod}
          />
          {selected ? (
            <Card style={styles.price}>
              <Text variant="title" style={styles.number}>
                {t(
                  selected.period === 'yearly'
                    ? 'gymAddon.paywall.perYear'
                    : 'gymAddon.paywall.perMonth',
                  { price: selected.priceString },
                )}
              </Text>
              {withTrial ? <Text tone="secondary">{t('gymAddon.paywall.trial')}</Text> : null}
            </Card>
          ) : null}
          <Button
            label={t(withTrial ? 'gymAddon.paywall.start' : 'gymAddon.paywall.startPlain')}
            disabled={busy || !selected}
            onPress={buy}
          />
          <Button
            variant="secondary"
            label={t('gymAddon.paywall.restore')}
            disabled={busy}
            onPress={doRestore}
          />
        </>
      )}

      {message ? <Text tone="secondary">{message}</Text> : null}
      {__DEV__ && !hasGym ? (
        <Button
          variant="secondary"
          label={t('gymAddon.paywall.devUnlock')}
          onPress={() => setDevGym(true)}
        />
      ) : null}
      {hasGym ? null : (
        <Button
          variant="secondary"
          small
          label={t('gymAddon.paywall.manage')}
          onPress={() => router.push('/subscription')}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  price: { gap: spacing.xs },
  number: { fontVariant: ['tabular-nums'] },
});
