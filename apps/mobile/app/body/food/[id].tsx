import { useLocalSearchParams } from 'expo-router';

import { todayIso } from '@/data/ids';
import { FoodDetailScreen } from '@/features/body/food/screens/food-detail-screen';
import { asFoodMode } from '@/features/body/food/flow';
import { asMeal } from '@/features/body/meals';

export default function FoodRoute() {
  const { mode, id, meal, day } = useLocalSearchParams<{
    mode?: string;
    id: string;
    meal?: string;
    day?: string;
  }>();
  return (
    <FoodDetailScreen id={id} meal={asMeal(meal)} day={day ?? todayIso()} mode={asFoodMode(mode)} />
  );
}
