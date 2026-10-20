import { useLocalSearchParams } from 'expo-router';

import { RoutineBuilderScreen } from '@/features/gym/screens/routine-builder-screen';

export default function RoutineBuilderRoute() {
  const { id, folderId } = useLocalSearchParams<{ id: string; folderId?: string }>();
  return <RoutineBuilderScreen key={id} id={id} folderId={folderId} />;
}
