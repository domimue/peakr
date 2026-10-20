import { Redirect, useLocalSearchParams } from 'expo-router';

/** Moved to the Gym workspace (Phase 8d). */
export default function OldQuickLogRoute() {
  const params = useLocalSearchParams<{ sourceId?: string }>();
  return <Redirect href={{ pathname: '/gym/quick-log', params }} />;
}
