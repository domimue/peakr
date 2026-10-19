import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { supabase } from '../supabase';
import { requestSync } from './use-background-sync';

/**
 * While the app is open, a new or changed activity on the server (Strava webhook) arrives through
 * Supabase Realtime and is synced into SQLite at once. When the app is closed a push does the same
 * (`features/notifications/background-task.ts`).
 */
export function useActivityRealtime(userId: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || !supabase) return;
    const client = supabase;
    const channel = client
      .channel(`activities:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activities', filter: `user_id=eq.${userId}` },
        () => {
          void requestSync(userId).then((changed) => {
            if (changed) void queryClient.invalidateQueries();
          });
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
