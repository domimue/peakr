import { useLocalSearchParams } from 'expo-router';

import { todayIso } from '@/data/ids';
import { AddFoodScreen } from '@/features/body/food/screens/add-food-screen';
import { asFoodMode } from '@/features/body/food/flow';
import { asMeal } from '@/features/body/meals';

export default function AddFoodRoute() {
  const { mode, meal, day } = useLocalSearchParams<{
    mode?: string;
    meal?: string;
    day?: string;
  }>();
  return <AddFoodScreen meal={asMeal(meal)} day={day ?? todayIso()} mode={asFoodMode(mode)} />;
}
