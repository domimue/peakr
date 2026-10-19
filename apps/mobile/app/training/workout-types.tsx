import { useLocalSearchParams } from 'expo-router';

import { WorkoutTypesScreen } from '@/features/plan/screens/workout-types-screen';

export default function WorkoutTypesRoute() {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  return <WorkoutTypesScreen focus={focus} />;
}
