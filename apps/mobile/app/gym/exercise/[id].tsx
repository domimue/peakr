import { useLocalSearchParams } from 'expo-router';

import { ExerciseDetailScreen } from '@/features/gym/screens/library-screens';

export default function ExerciseDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseDetailScreen key={id} id={id} />;
}
