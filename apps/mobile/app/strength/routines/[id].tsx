import { useLocalSearchParams } from 'expo-router';

import { RoutineBuilderScreen } from '@/features/strength/screens/routine-builder-screen';

export default function RoutineBuilderRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RoutineBuilderScreen key={id} id={id} />;
}
