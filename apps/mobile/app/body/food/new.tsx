import { useLocalSearchParams } from 'expo-router';

import { todayIso } from '@/data/ids';
import { FoodFormScreen } from '@/features/body/food/screens/food-form-screen';
import { asFoodMode } from '@/features/body/food/flow';
import { asMeal } from '@/features/body/meals';

export default function NewFoodRoute() {
  const { mode, id, barcode, meal, day } = useLocalSearchParams<{
    mode?: string;
    id?: string;
    barcode?: string;
    meal?: string;
    day?: string;
  }>();
  return (
    <FoodFormScreen
      id={id}
      barcode={barcode}
      meal={asMeal(meal)}
      day={day ?? todayIso()}
      mode={asFoodMode(mode)}
    />
  );
}
