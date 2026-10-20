import { useLocalSearchParams } from 'expo-router';

import { WorkoutScreen } from '@/features/gym/screens/workout-screen';

export default function GymSessionRoute() {
  const { routineId, templateId, workoutId } = useLocalSearchParams<{
    routineId?: string;
    templateId?: string;
    workoutId?: string;
  }>();
  return <WorkoutScreen routineId={routineId} templateId={templateId} workoutId={workoutId} />;
}
