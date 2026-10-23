/**
 * Features that exist in code but stay off until a partner programme approves them or a later
 * phase ships them (CLAUDE.md "Integrations"). Flip a flag only together with that approval.
 */
export const featureFlags = {
  /** Komoot partner API (OAuth, tour import/upload) – partner contract required. */
  komootApi: false,
  /** Zwift Training Connections (push scheduled workouts) – Zwift approves each platform. */
  zwiftTrainingConnections: false,
  /** Generated round trips via a RoutingProvider (Phase 8b). */
  generatedRoutes: false,
} as const;

export type FeatureFlag = keyof typeof featureFlags;

export function isEnabled(flag: FeatureFlag): boolean {
  return featureFlags[flag];
}
