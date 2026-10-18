import { useLocalSearchParams } from 'expo-router';

import { QuickLogScreen } from '@/features/strength/screens/quick-log-screen';

export default function QuickLogRoute() {
  const { sourceId } = useLocalSearchParams<{ sourceId?: string }>();
  return <QuickLogScreen sourceId={sourceId} />;
}
