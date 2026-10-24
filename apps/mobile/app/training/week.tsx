import { useLocalSearchParams } from 'expo-router';

import { withTraining } from '@/features/billing/locked';
import { WeekScreen } from '@/features/plan/screens/week-screen';

function WeekRoute() {
  const { start } = useLocalSearchParams<{ start?: string }>();
  return <WeekScreen start={start} />;
}

export default withTraining(WeekRoute, { allowReadOnly: true });
