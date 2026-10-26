import { create } from 'zustand';

import * as repo from '@/data/repositories/flags-repository';

import { personalBuild } from './build';

/**
 * Remote feature flags (Supabase table `feature_flags`): features that ship hidden in a release
 * and are switched on without one. The last values are kept on the device, so a start without
 * reception keeps what the server said; without either the default applies (off).
 */
export const REMOTE_FLAG_DEFAULTS = {
  /** The Body add-on (Phase 11b): Body tab, "Energy today", the add-on and bundle offers. */
  addon_body_nutrition: false,
} as const;

export type RemoteFlag = keyof typeof REMOTE_FLAG_DEFAULTS;
export type RemoteFlags = Record<RemoteFlag, boolean>;

/** The personal build (owner's own APK, never distributed) sees every hidden feature. */
const PERSONAL_BUILD_FLAGS: readonly RemoteFlag[] = ['addon_body_nutrition'];

export function parseRemoteFlags(rows: unknown): Partial<RemoteFlags> {
  const flags: Partial<RemoteFlags> = {};
  if (!Array.isArray(rows)) return flags;
  for (const row of rows as { key?: unknown; enabled?: unknown }[]) {
    if (typeof row?.key === 'string' && row.key in REMOTE_FLAG_DEFAULTS) {
      flags[row.key as RemoteFlag] = row.enabled === true;
    }
  }
  return flags;
}

export function remoteFlagOn(
  flags: Partial<RemoteFlags>,
  flag: RemoteFlag,
  personal: boolean = personalBuild,
): boolean {
  if (personal && PERSONAL_BUILD_FLAGS.includes(flag)) return true;
  return flags[flag] ?? REMOTE_FLAG_DEFAULTS[flag];
}

interface RemoteFlagsState {
  flags: Partial<RemoteFlags>;
  loaded: boolean;
  /** Cached values first, then the server's. */
  load: () => Promise<void>;
}

export const useRemoteFlagsStore = create<RemoteFlagsState>()((set) => ({
  flags: {},
  loaded: false,
  async load() {
    const cached = await repo.getCachedFlags().catch(() => ({}));
    set((s) => ({ flags: { ...cached, ...s.flags } }));
    const fresh = await repo.fetchFlags().catch(() => null);
    if (fresh) {
      set({ flags: fresh });
      await repo.saveCachedFlags(fresh).catch(() => undefined);
    }
    set({ loaded: true });
  },
}));

export function useRemoteFlag(flag: RemoteFlag): boolean {
  return useRemoteFlagsStore((s) => remoteFlagOn(s.flags, flag));
}
