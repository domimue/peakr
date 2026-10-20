import { create } from 'zustand';

export type BaselineFlow = 'onboarding' | 'recalibrate';

interface PendingConnect {
  /**
   * A Strava connection started from the baseline flow and not finished yet. On Android the
   * Strava app may handle the consent; the result then arrives as a deep link
   * (`peakr://integrations/strava`) instead of through the auth session, and this says where the
   * user came from, so they go on with the baseline instead of landing in Connections.
   */
  flow: BaselineFlow | null;
  set: (flow: BaselineFlow | null) => void;
}

export const usePendingConnect = create<PendingConnect>()((set) => ({
  flow: null,
  set: (flow) => set({ flow }),
}));
