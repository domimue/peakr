import { useTranslation } from 'react-i18next';

import { Screen, Text } from '@/ui';

export default function ToolsScreen() {
  const { t } = useTranslation();
  return (
    <Screen title={t('tools.title')}>
      <Text tone="secondary">{t('tools.empty')}</Text>
    </Screen>
  );
}
