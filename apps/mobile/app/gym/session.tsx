import { useLocalSearchParams } from 'expo-router';

import { WorkoutScreen } from '@/features/gym/screens/workout-screen';

export default function GymSessionRoute() {
  const { routineId, templateId, workoutId, empty } = useLocalSearchParams<{
    routineId?: string;
    templateId?: string;
    workoutId?: string;
    empty?: string;
  }>();
  return (
    <WorkoutScreen
      routineId={routineId}
      templateId={templateId}
      workoutId={workoutId}
      empty={empty === '1'}
    />
  );
}
