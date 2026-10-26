import { useLocalSearchParams } from 'expo-router';

import { todayIso } from '@/data/ids';
import { FoodFormScreen } from '@/features/body/food/screens/food-form-screen';
import { asMeal } from '@/features/body/meals';

export default function NewFoodRoute() {
  const { id, barcode, meal, day } = useLocalSearchParams<{
    id?: string;
    barcode?: string;
    meal?: string;
    day?: string;
  }>();
  return <FoodFormScreen id={id} barcode={barcode} meal={asMeal(meal)} day={day ?? todayIso()} />;
}
