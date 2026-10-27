import { useLocalSearchParams } from 'expo-router';

import { todayIso } from '@/data/ids';
import { ScanScreen } from '@/features/body/food/screens/scan-screen';
import { asFoodMode } from '@/features/body/food/flow';
import { asMeal } from '@/features/body/meals';

export default function ScanRoute() {
  const { mode, meal, day } = useLocalSearchParams<{
    mode?: string;
    meal?: string;
    day?: string;
  }>();
  return <ScanScreen meal={asMeal(meal)} day={day ?? todayIso()} mode={asFoodMode(mode)} />;
}
