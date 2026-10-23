/**
 * Endpoints of the three watch platforms in one place (no imports, so the OAuth registry can use
 * them without pulling in the FIT SDK). `verified: false` everywhere: the platforms publish their
 * API references to approved partners only, so every address and field name here is our best
 * description of the documented concepts and gets confirmed when access is granted – see
 * docs/watch-integrations.md for what is confirmed and what is not.
 */

export const GARMIN = {
  verified: false,
  /** OAuth 2.0 with PKCE (Garmin Connect Developer Program). */
  authorizeUrl: 'https://connect.garmin.com/oauth2Confirm',
  tokenUrl: 'https://diauth.garmin.com/di-oauth2-service/oauth/token',
  trainingBase: 'https://apis.garmin.com/training-api',
  coursesBase: 'https://apis.garmin.com/training-api/courses/v1',
} as const;

export const COROS = {
  verified: false,
  authorizeUrl: 'https://open.coros.com/oauth2/authorize',
  tokenUrl: 'https://open.coros.com/oauth2/accesstoken',
  refreshUrl: 'https://open.coros.com/oauth2/refresh-token',
  apiBase: 'https://open.coros.com',
  /** COROS shows the next 7 days of a plan. */
  windowDays: 7,
} as const;

export const SUUNTO = {
  verified: false,
  authorizeUrl: 'https://cloudapi-oauth.suunto.com/oauth/authorize',
  tokenUrl: 'https://cloudapi-oauth.suunto.com/oauth/token',
  apiBase: 'https://cloudapi.suunto.com',
} as const;
