// The pure part of the round-trip generation lives with the Edge Functions (it must run there with
// no build step) and is re-exported here for the tests.
export * from '../../../supabase/functions/_shared/routing/model.ts';
