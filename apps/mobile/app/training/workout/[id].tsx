import { useLocalSearchParams } from 'expo-router';

import { WorkoutScreen } from '@/features/plan/screens/workout-screen';

export default function WorkoutRoute() {
  const { id, move } = useLocalSearchParams<{ id: string; move?: string }>();
  return <WorkoutScreen id={id} startMoving={move === '1'} />;
}
