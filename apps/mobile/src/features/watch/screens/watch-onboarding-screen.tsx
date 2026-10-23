import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Screen, Text } from '@/ui';

import type { WatchChoice } from '../options';
import { useSaveWatchChoice, useWatchChoice } from '../queries';
import { WatchPicker } from '../watch-picker';

/**
 * Onboarding step between the quiz and the forecast: which watch the user wears. Skippable – the
 * plan does not depend on it; the choice only decides how workouts reach the watch.
 */
export function WatchOnboardingScreen() {
  const { t } = useTranslation();
  const { data: saved } = useWatchChoice();
  const save = useSaveWatchChoice();
  const [picked, setPicked] = useState<WatchChoice | null>(null);
  const value = picked ?? saved ?? null;

  const next = () => router.push('/onboarding/forecast');
  const onContinue = () => {
    if (value) save.mutate(value);
    next();
  };

  return (
    <Screen title={t('watch.title')}>
      <Text tone="secondary">{t('watch.intro')}</Text>
      <WatchPicker value={value} onChange={setPicked} />
      <Button label={t('watch.continue')} disabled={value === null} onPress={onContinue} />
      <Button variant="secondary" label={t('watch.skip')} onPress={next} />
    </Screen>
  );
}
