import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

/** Gym workspace screens opened from the Gym tab, the plan and the profile. */
export default function GymLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="library" options={{ title: t('gym.library.title') }} />
      <Stack.Screen name="exercise/[id]" options={{ title: t('gym.exercise.title') }} />
      <Stack.Screen name="exercise/edit" options={{ title: t('gym.exercise.editTitle') }} />
      <Stack.Screen name="routines/index" options={{ title: t('strength.routines.title') }} />
      <Stack.Screen name="routines/[id]" options={{ title: t('strength.builder.title') }} />
      <Stack.Screen name="session" options={{ title: t('strength.workout.title') }} />
      <Stack.Screen name="quick-log" options={{ title: t('strength.quickLog.title') }} />
      <Stack.Screen name="import" options={{ title: t('gym.import.title') }} />
    </Stack>
  );
}
