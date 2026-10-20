import { Redirect, useLocalSearchParams } from 'expo-router';

/** Moved to the Gym workspace (Phase 8d). */
export default function OldRoutineBuilderRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/gym/routines/[id]', params: { id } }} />;
}
