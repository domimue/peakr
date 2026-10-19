import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function TrainingLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="workout/[id]" options={{ title: t('plan.workout.title') }} />
      <Stack.Screen name="availability" options={{ title: t('plan.availability.title') }} />
      <Stack.Screen name="pause" options={{ title: t('plan.pause.title') }} />
      <Stack.Screen name="workout-types" options={{ title: t('workoutTypes.title') }} />
    </Stack>
  );
}
