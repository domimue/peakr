import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { usePendingConnect } from '@/features/baseline/pending-connect';
import { BaselineConnectResult } from '@/features/baseline/screens/baseline-connect-result';
import { ConnectionsScreen } from '@/features/integrations/screens/connections-screen';

/**
 * Deep link back from the OAuth flow (`peakr://integrations/strava?status=connected`) when it did
 * not return through the auth session (e.g. the Strava app handled the consent on Android). A
 * connection started from the plan calibration goes on with it; anything else shows Connections.
 */
export default function IntegrationResult() {
  const { status } = useLocalSearchParams<{ provider: string; status?: string }>();
  // Read once: the result screen clears the pending flow while it goes on.
  const [pending] = useState(() => usePendingConnect.getState().flow);
  const result = status === 'connected' || status === 'denied' ? status : 'error';
  if (pending) return <BaselineConnectResult flow={pending} result={result} />;
  return <ConnectionsScreen result={result} />;
}
