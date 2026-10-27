import { useLocalSearchParams } from 'expo-router';

import { withTraining } from '@/features/billing/locked';
import { RouteSuggestionScreen } from '@/features/routes/screens/route-suggestion-screen';

function SuggestionRoute() {
  const { key } = useLocalSearchParams<{ key: string }>();
  return <RouteSuggestionScreen routeKey={decodeURIComponent(key ?? '')} />;
}

export default withTraining(SuggestionRoute);
