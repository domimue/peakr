import { useLocalSearchParams } from 'expo-router';

import { StrengthWorkoutScreen } from '@/features/strength/screens/strength-workout-screen';

export default function StrengthWorkoutRoute() {
  const { routineId, templateId } = useLocalSearchParams<{
    routineId?: string;
    templateId?: string;
  }>();
  return <StrengthWorkoutScreen routineId={routineId} templateId={templateId} />;
}
