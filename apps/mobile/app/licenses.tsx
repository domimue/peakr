import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card, Screen, Text } from '@/ui';

/** Third-party notices (fonts and libraries that require attribution). */
export default function LicensesScreen() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('licenses.title') }} />
      <Screen>
        <Text tone="secondary">{t('licenses.intro')}</Text>
        <Card>
          <Text variant="heading">{t('licenses.archivo.name')}</Text>
          <Text>{t('licenses.archivo.description')}</Text>
          <Text tone="secondary">{t('licenses.archivo.license')}</Text>
        </Card>
        {(['maplibre', 'maps'] as const).map((key) => (
          <Card key={key}>
            <Text variant="heading">{t(`licenses.${key}.name`)}</Text>
            <Text>{t(`licenses.${key}.description`)}</Text>
            <Text tone="secondary">{t(`licenses.${key}.license`)}</Text>
          </Card>
        ))}
        <Text variant="caption" tone="secondary">
          {t('licenses.openFoodFacts')}
        </Text>
      </Screen>
    </>
  );
}
