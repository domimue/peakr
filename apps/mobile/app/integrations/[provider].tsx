import { useLocalSearchParams } from 'expo-router';

import { ConnectionsScreen } from '@/features/integrations/screens/connections-screen';

/**
 * Deep link back from the OAuth flow (`peakr://integrations/strava?status=connected`) when it did
 * not return through the auth session (e.g. the Strava app handled the consent on Android).
 */
export default function IntegrationResult() {
  const { status } = useLocalSearchParams<{ provider: string; status?: string }>();
  const result = status === 'connected' || status === 'denied' ? status : 'error';
  return <ConnectionsScreen result={result} />;
}
