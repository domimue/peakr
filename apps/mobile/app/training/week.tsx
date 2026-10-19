import { useLocalSearchParams } from 'expo-router';

import { WeekScreen } from '@/features/plan/screens/week-screen';

export default function WeekRoute() {
  const { start } = useLocalSearchParams<{ start?: string }>();
  return <WeekScreen start={start} />;
}
