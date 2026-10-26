import { useLocalSearchParams } from 'expo-router';

import { todayIso } from '@/data/ids';
import { FoodDetailScreen } from '@/features/body/food/screens/food-detail-screen';
import { asMeal } from '@/features/body/meals';

export default function FoodRoute() {
  const { id, meal, day } = useLocalSearchParams<{ id: string; meal?: string; day?: string }>();
  return <FoodDetailScreen id={id} meal={asMeal(meal)} day={day ?? todayIso()} />;
}
