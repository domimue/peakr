import { useTranslation } from 'react-i18next';

import { Screen, Text } from '@/ui';

export default function PlanScreen() {
  const { t } = useTranslation();
  return (
    <Screen title={t('plan.title')}>
      <Text tone="secondary">{t('plan.empty')}</Text>
    </Screen>
  );
}
