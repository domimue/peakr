import { useLocalSearchParams } from 'expo-router';

import { ExerciseEditScreen } from '@/features/gym/screens/library-screens';

export default function ExerciseEditRoute() {
  const { id, copyOf } = useLocalSearchParams<{ id?: string; copyOf?: string }>();
  return <ExerciseEditScreen id={id} copyOf={copyOf} />;
}
