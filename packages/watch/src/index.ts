// The provider-neutral watch code lives with the Edge Functions (it must run there with no build
// step) and is re-exported here for the app and the tests.
export * from '../../../supabase/functions/_shared/watch/model.ts';
export {
  decodeWorkoutFit,
  encodeWorkoutFit,
  fitSteps,
  isWorkoutFit,
  type DecodedWorkoutFit,
} from '../../../supabase/functions/_shared/watch/fit-workout.ts';
export { routeToGpx } from '../../../supabase/functions/_shared/watch/gpx-course.ts';
export {
  inWindow,
  planSync,
  workoutHash,
  type PushedRecord,
  type SyncPlan,
} from '../../../supabase/functions/_shared/watch/sync.ts';
export {
  mergeSegments,
  toWatchWorkouts,
  type ExportResult,
  type NotExportable,
  type WatchContext,
} from './from-plan';
