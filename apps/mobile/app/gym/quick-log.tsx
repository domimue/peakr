import { useLocalSearchParams } from 'expo-router';

import { QuickLogScreen } from '@/features/gym/screens/quick-log-screen';

export default function QuickLogRoute() {
  const { sourceId, workoutId } = useLocalSearchParams<{ sourceId?: string; workoutId?: string }>();
  return <QuickLogScreen sourceId={sourceId} workoutId={workoutId} />;
}
