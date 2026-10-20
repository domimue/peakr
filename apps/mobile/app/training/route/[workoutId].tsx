import { useLocalSearchParams } from 'expo-router';

import { RoutePickerScreen } from '@/features/routes/screens/route-picker-screen';

export default function RoutePickerRoute() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  return <RoutePickerScreen workoutId={workoutId} />;
}
