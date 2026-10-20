import { Redirect, useLocalSearchParams } from 'expo-router';

/** Moved to the Gym workspace (Phase 8d). */
export default function OldWorkoutRoute() {
  const params = useLocalSearchParams<{ routineId?: string; templateId?: string }>();
  return <Redirect href={{ pathname: '/gym/session', params }} />;
}
