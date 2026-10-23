// The Garmin health code lives with the Edge Functions (it must run there with no build step) and
// is re-exported here for the app and the tests.
export * from '../../../supabase/functions/_shared/health/model.ts';
