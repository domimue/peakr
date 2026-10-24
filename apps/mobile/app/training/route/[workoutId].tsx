import { useLocalSearchParams } from 'expo-router';

import { withTraining } from '@/features/billing/locked';
import { RoutePickerScreen } from '@/features/routes/screens/route-picker-screen';

function RoutePickerRoute() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  return <RoutePickerScreen workoutId={workoutId} />;
}

export default withTraining(RoutePickerRoute);
