import { useLocalSearchParams } from 'expo-router';

import { todayIso } from '@/data/ids';
import { AddFoodScreen } from '@/features/body/food/screens/add-food-screen';
import { asMeal } from '@/features/body/meals';

export default function AddFoodRoute() {
  const { meal, day } = useLocalSearchParams<{ meal?: string; day?: string }>();
  return <AddFoodScreen meal={asMeal(meal)} day={day ?? todayIso()} />;
}
