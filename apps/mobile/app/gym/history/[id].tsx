import { useLocalSearchParams } from 'expo-router';

import { SessionDetailScreen } from '@/features/gym/screens/summary-screens';

export default function GymSessionDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionDetailScreen id={id} />;
}
