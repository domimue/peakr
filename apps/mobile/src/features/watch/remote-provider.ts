import type {
  ImportResult,
  PushItem,
  PushResult,
  WatchCapabilities,
  WatchFailure,
  WatchProvider,
  WatchRoute,
  WatchWorkout,
} from '@peakr/watch';

import { supabase } from '@/data/supabase';
import { todayIso } from '@/data/ids';
import { disconnect } from '@/features/integrations/api';

import type { DirectWatch } from './options';

/**
 * A watch platform reached through the Edge Function `watch` (Garmin, COROS, Suunto): the tokens
 * and API keys stay on the server, the app only sends the neutral workout model and gets the
 * outcome per workout back.
 */

export type Invoke = (
  path: string,
  body: object,
) => Promise<{ ok: true; data: unknown } | { ok: false }>;

const defaultInvoke: Invoke = async (path, body) => {
  if (!supabase) return { ok: false };
  const { data, error } = await supabase.functions.invoke(path, { body });
  return error ? { ok: false } : { ok: true, data };
};

const CAPABILITIES: Record<DirectWatch, WatchCapabilities> = {
  garmin: { workouts: true, routes: true, activities: true, sports: ['run', 'bike', 'swim'], strength: false },
  coros: { workouts: true, routes: false, activities: true, sports: ['run', 'bike', 'swim'], strength: false },
  suunto: { workouts: true, routes: true, activities: true, sports: ['run', 'bike', 'swim'], strength: false },
};

interface Reply {
  ok?: boolean;
  failure?: WatchFailure;
  detail?: string;
  items?: PushItem[];
  imported?: number;
}

function pushResult(reply: Reply): PushResult {
  if (reply.ok && reply.items) return { ok: true, items: reply.items };
  return { ok: false, failure: reply.failure ?? 'rejected', detail: reply.detail };
}

export interface RemoteOptions {
  invoke?: Invoke;
  today?: () => string;
}

export function createRemoteWatchProvider(
  id: DirectWatch,
  { invoke = defaultInvoke, today = todayIso }: RemoteOptions = {},
): WatchProvider {
  return {
    id,
    capabilities: CAPABILITIES[id],
    async pushWorkouts(workouts: readonly WatchWorkout[]): Promise<PushResult> {
      const r = await invoke('watch/push', { provider: id, workouts, today: today() });
      return r.ok ? pushResult(r.data as Reply) : { ok: false, failure: 'network' };
    },
    async pushRoute(route: WatchRoute): Promise<PushResult> {
      const r = await invoke('watch/route', { provider: id, route });
      return r.ok ? pushResult(r.data as Reply) : { ok: false, failure: 'network' };
    },
    async importActivities(since: Date): Promise<ImportResult> {
      const r = await invoke('watch/import', { provider: id, since: since.toISOString() });
      if (!r.ok) return { ok: false, failure: 'network' };
      const reply = r.data as Reply;
      // The server stores the activities itself; the app receives them through the normal sync.
      return reply.ok
        ? { ok: true, rows: [], deleted: [] }
        : { ok: false, failure: reply.failure ?? 'rejected', detail: reply.detail };
    },
    async disconnect(): Promise<void> {
      await disconnect(id);
    },
  };
}
