import { useLocalSearchParams } from 'expo-router';

import { SendToWatchScreen } from '@/features/watch/screens/send-to-watch-screen';

export default function SendToWatchRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SendToWatchScreen id={id} />;
}
