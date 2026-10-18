import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, Screen, Text } from '@/ui';

export default function PlanScreen() {
  const { t } = useTranslation();
  return (
    <Screen title={t('plan.title')}>
      <Text tone="secondary">{t('plan.empty')}</Text>
      <Button label={t('plan.startQuiz')} onPress={() => router.push('/onboarding')} />
    </Screen>
  );
}
