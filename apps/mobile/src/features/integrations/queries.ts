import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/data/supabase';

/** Connected services of the signed-in user (table `integrations`, metadata only, no tokens). */

export interface IntegrationInfo {
  provider: string;
  status: 'active' | 'expired' | 'revoked' | 'error';
  connectedAt: string;
  lastSyncedAt: string | null;
}

interface IntegrationRow {
  provider: string;
  status: IntegrationInfo['status'];
  connected_at: string;
  last_synced_at: string | null;
}

export const integrationKeys = { all: ['integrations'] as const };

async function fetchIntegrations(): Promise<IntegrationInfo[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('integrations')
    .select('provider, status, connected_at, last_synced_at')
    .overrideTypes<IntegrationRow[], { merge: false }>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    provider: r.provider,
    status: r.status,
    connectedAt: r.connected_at,
    lastSyncedAt: r.last_synced_at,
  }));
}

export function useIntegrations(userId: string | null) {
  return useQuery({
    queryKey: [...integrationKeys.all, userId],
    queryFn: fetchIntegrations,
    enabled: userId !== null && supabase !== null,
  });
}
