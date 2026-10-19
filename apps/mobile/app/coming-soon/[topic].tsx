import { Redirect, useLocalSearchParams } from 'expo-router';

import { ComingSoonScreen, isComingSoonTopic } from '@/features/profile/coming-soon-screen';

export default function ComingSoonRoute() {
  const { topic } = useLocalSearchParams<{ topic: string }>();
  if (!isComingSoonTopic(topic)) return <Redirect href="/today" />;
  return <ComingSoonScreen topic={topic} />;
}
