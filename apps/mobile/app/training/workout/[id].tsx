import { useLocalSearchParams } from 'expo-router';

import { WorkoutScreen } from '@/features/plan/screens/workout-screen';

export default function WorkoutRoute() {
  const { id, move, setting } = useLocalSearchParams<{
    id: string;
    move?: string;
    setting?: string;
  }>();
  return (
    <WorkoutScreen
      id={id}
      startMoving={move === '1'}
      initialSetting={setting === 'indoor' ? 'indoor' : undefined}
    />
  );
}
