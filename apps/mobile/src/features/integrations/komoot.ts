import type { GpxPoint } from '@peakr/engine';

import { featureFlags } from '@/config/feature-flags';

/**
 * Komoot (CLAUDE.md "Integrations"): the official API is partner-only. Phase 1 stores the user's
 * public profile URL and imports Komoot tours as GPX files. Phase 2 (OAuth with the scopes
 * `profile` and `tour-upload`) goes behind this interface once the partner contract exists.
 * Never scrape komoot.com.
 */

export interface KomootTour {
  id: string;
  name: string;
  sport: 'run' | 'bike';
  distanceM: number;
}

export interface KomootClient {
  readonly available: boolean;
  listTours(): Promise<KomootTour[]>;
  tourPoints(id: string): Promise<GpxPoint[]>;
  uploadTour(name: string, points: readonly GpxPoint[]): Promise<string | null>;
}

/** Used until the partner API is approved: offers nothing, does nothing. */
export const noopKomootClient: KomootClient = {
  available: false,
  listTours: async () => [],
  tourPoints: async () => [],
  uploadTour: async () => null,
};

export function komootClient(): KomootClient {
  // The partner implementation is added here behind the flag (Phase 2).
  if (featureFlags.komootApi) throw new Error('Komoot partner API is not implemented yet');
  return noopKomootClient;
}

/**
 * A Komoot profile URL: `https://www.komoot.com/user/<id>` with an optional locale segment
 * (`/de-de/`). Returns the normalised URL or null.
 */
export function normalizeKomootProfileUrl(input: string): string | null {
  const m =
    /^(?:https?:\/\/)?(?:www\.)?komoot\.(?:com|de)\/(?:[a-z]{2}-[a-z]{2}\/)?user\/([A-Za-z0-9_-]{1,40})\/?(?:[?#].*)?$/i.exec(
      input.trim(),
    );
  return m ? `https://www.komoot.com/user/${m[1]}` : null;
}
