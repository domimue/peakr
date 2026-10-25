/**
 * Features that exist in code but stay off until a partner programme approves them or a later
 * phase ships them (CLAUDE.md "Integrations"). Flip a flag only together with that approval.
 */
export const featureFlags = {
  /** Komoot partner API (OAuth, tour import/upload) – partner contract required. */
  komootApi: false,
  /**
   * Direct sync with the watch platforms (CLAUDE.md "Watch integrations"). Flip each one together
   * with its Edge Function secret (`WATCH_GARMIN_TRAINING` …) once the partner programme has
   * approved Peakr; until then the picker offers the file export for that brand.
   */
  garminWatch: false,
  corosWatch: false,
  suuntoWatch: false,
  /** Zwift Training Connections (push scheduled workouts) – Zwift approves each platform. */
  zwiftTrainingConnections: false,
  /**
   * Garmin health data over OAuth (Health API push, Starter tier) – flip together with the Edge
   * Function secret `GARMIN_HEALTH` once Garmin has approved Peakr.
   */
  garminHealth: false,
  /**
   * Developer only: paste a Garmin Personal API key (pull, own data). The Personal API terms are
   * written for a person's own tools, not for a third-party app, so this never ships switched on
   * (docs/health-garmin.md). Needs the server secret `GARMIN_PERSONAL_KEY=1` as well.
   */
  garminPersonalKey: false,
  /**
   * Generated round trips (Phase 8b): the route picker's third option, served by the `round-trips`
   * Edge Function. Flip together with the secret `ORS_API_KEY` (docs/generated-routes.md).
   */
  generatedRoutes: false,
} as const;

export type FeatureFlag = keyof typeof featureFlags;

export function isEnabled(flag: FeatureFlag): boolean {
  return featureFlags[flag];
}
