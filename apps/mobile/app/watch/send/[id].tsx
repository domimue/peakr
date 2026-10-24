import { useLocalSearchParams } from 'expo-router';

import { withTraining } from '@/features/billing/locked';
import { SendToWatchScreen } from '@/features/watch/screens/send-to-watch-screen';

function SendToWatchRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SendToWatchScreen id={id} />;
}

export default withTraining(SendToWatchRoute);
