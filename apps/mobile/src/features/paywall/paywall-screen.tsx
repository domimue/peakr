import { toPlanInput } from '@peakr/quiz';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import { authAvailable, selectAccountUserId, useSessionStore } from '@/features/auth/session-store';
import { useBaselineStore } from '@/features/baseline/baseline-store';
import { calibrateOnboarding } from '@/features/baseline/calibration';
import { useQuizStore } from '@/features/onboarding/quiz-store';
import { useCreatePlan } from '@/features/plan/queries';
import { Badge, Button, Card, Screen, spacing, Text } from '@/ui';

/**
 * Placeholder paywall. In-app purchases (Google Play / App Store via RevenueCat) replace this in
 * the billing phase; no prices are shown until they come from the store.
 */
export function PaywallScreen() {
  const { t } = useTranslation();
  const { answers, hydrate } = useQuizStore();
  const createPlan = useCreatePlan();
  const signedIn = useSessionStore((s) => selectAccountUserId(s) !== null);

  useEffect(() => {
    void hydrate();
    void useBaselineStore.getState().hydrate();
  }, [hydrate]);

  // Until billing exists, development builds can start the plan without a purchase.
  const startWithoutPurchase = () => {
    const today = todayIso();
    const input = toPlanInput(answers, today);
    if (!input.ok) return router.replace('/onboarding/quiz');
    const { profile, goal, availability, startDate, targetDate, hrZones, stravaHrZones } =
      calibrateOnboarding(input.value, useBaselineStore.getState(), today);
    createPlan.mutate(
      {
        profile,
        goal,
        availability,
        startDate,
        hrZones,
        ...(targetDate ? { targetDate } : {}),
        ...(stravaHrZones ? { stravaHrZones } : {}),
      },
      // App flow: purchase → account → plan. The plan made before sign-in moves into the account.
      { onSuccess: () => router.replace(authAvailable && !signedIn ? '/auth/sign-in' : '/today') },
    );
  };

  return (
    <Screen title={t('paywall.title')}>
      <Text tone="secondary">{t('paywall.trial')}</Text>
      <Card>
        <Text variant="heading">{t('paywall.tiers.training.name')}</Text>
        <Text tone="secondary">{t('paywall.tiers.training.description')}</Text>
      </Card>
      <Card>
        <View style={styles.row}>
          <Text variant="heading" style={styles.flex}>
            {t('paywall.tiers.plus.name')}
          </Text>
          <Badge label={t('paywall.comingSoon')} />
        </View>
        <Text tone="secondary">{t('paywall.tiers.plus.description')}</Text>
      </Card>
      <Card>
        <Text>{t('paywall.placeholder')}</Text>
      </Card>
      {__DEV__ ? (
        <Button
          label={t('plan.devStart')}
          disabled={createPlan.isPending}
          onPress={startWithoutPurchase}
        />
      ) : null}
      <Button variant="secondary" label={t('paywall.back')} onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
