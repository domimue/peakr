import { useTranslation } from 'react-i18next';

import { ProfileSetupCard } from '@/features/body/components/profile-setup-card';
import { useBodyProfile } from '@/features/body/profile';
import { ListState, Screen, Text } from '@/ui';

/**
 * Profile → Personal data: sex, birth date, height and weight – one profile shared by the plan
 * (age, heart-rate estimate) and the Body add-on (energy), so nothing is asked twice.
 */
export function PersonalDataScreen() {
  const { t } = useTranslation();
  const profile = useBodyProfile({ always: true });
  return (
    <Screen>
      <Text tone="secondary">{t('profile.personal.hint')}</Text>
      {profile.data ? (
        <ProfileSetupCard state={profile.data} all />
      ) : (
        <ListState kind="loading" label={t('common.loading')} />
      )}
    </Screen>
  );
}
