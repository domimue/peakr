import { strengthAnswersFrom } from '@peakr/quiz';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { LinkRow, Screen, Text } from '@/ui';

import { useSaveStrengthSetup, useStrengthSetup } from '../queries';
import { StrengthSetupForm } from '../setup-form';

/** Profile → Strength: change mode, split, equipment, days and priority anytime (§8.1). */
export function StrengthSetupScreen() {
  const { t } = useTranslation();
  const setup = useStrengthSetup();
  const save = useSaveStrengthSetup();

  if (setup.isPending) return <Screen />;

  return (
    <Screen>
      <Text tone="secondary">{t('strength.setup.intro')}</Text>
      <StrengthSetupForm
        initial={setup.data ? strengthAnswersFrom(setup.data) : {}}
        saving={save.isPending}
        onSave={(value) =>
          save.mutate(value, {
            onSuccess: () =>
              value.mode === 'routines' ? router.push('/strength/routines') : router.back(),
          })
        }
      />
      <LinkRow
        title={t('strength.routines.title')}
        hint={t('strength.routines.entryHint')}
        onPress={() => router.push('/strength/routines')}
      />
    </Screen>
  );
}
