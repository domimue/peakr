import { useLocalSearchParams } from 'expo-router';

import { todayIso } from '@/data/ids';
import { RecipeScreen } from '@/features/body/food/screens/recipe-screen';
import { asMeal } from '@/features/body/meals';

export default function RecipeRoute() {
  const { id, meal, day, scale } = useLocalSearchParams<{
    id?: string;
    meal?: string;
    day?: string;
    scale?: string;
  }>();
  const factor = scale ? Number(scale) : undefined;
  return (
    <RecipeScreen
      id={id}
      meal={asMeal(meal)}
      day={day ?? todayIso()}
      scale={factor && factor > 0 ? factor : undefined}
    />
  );
}
