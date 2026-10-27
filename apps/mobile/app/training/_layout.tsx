import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function TrainingLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="workout/[id]" options={{ title: t('plan.workout.title') }} />
      <Stack.Screen name="availability" options={{ title: t('plan.availability.title') }} />
      <Stack.Screen name="pause" options={{ title: t('plan.pause.title') }} />
      <Stack.Screen name="difficulty" options={{ title: t('plan.difficulty.title') }} />
      <Stack.Screen name="workout-types" options={{ title: t('workoutTypes.title') }} />
      <Stack.Screen name="week" options={{ title: t('plan.week.title') }} />
      <Stack.Screen name="travel" options={{ title: t('plan.travel.title') }} />
      <Stack.Screen name="commutes" options={{ title: t('plan.commutes.title') }} />
      <Stack.Screen name="winter" options={{ title: t('plan.winter.title') }} />
      <Stack.Screen name="weather" options={{ title: t('weather.settings.title') }} />
      <Stack.Screen name="zones" options={{ title: t('trainingZones.title') }} />
      <Stack.Screen name="terrain" options={{ title: t('terrainProfile.title') }} />
      <Stack.Screen name="baseline" options={{ title: t('baseline.recalibrate.title') }} />
      <Stack.Screen name="baseline-summary" options={{ title: t('baseline.recalibrate.title') }} />
      <Stack.Screen name="route/[workoutId]" options={{ title: t('routes.choose.title') }} />
      <Stack.Screen name="insights" options={{ title: t('insights.title') }} />
    </Stack>
  );
}
