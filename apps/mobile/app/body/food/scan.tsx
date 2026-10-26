import { useLocalSearchParams } from 'expo-router';

import { todayIso } from '@/data/ids';
import { ScanScreen } from '@/features/body/food/screens/scan-screen';
import { asMeal } from '@/features/body/meals';

export default function ScanRoute() {
  const { meal, day } = useLocalSearchParams<{ meal?: string; day?: string }>();
  return <ScanScreen meal={asMeal(meal)} day={day ?? todayIso()} />;
}
