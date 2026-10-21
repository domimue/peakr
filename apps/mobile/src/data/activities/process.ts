import { todayIso } from '../ids';
import * as activityRepo from '../repositories/activity-repository';
import * as gymRepo from '../repositories/gym-repository';
import * as planRepo from '../repositories/plan-repository';
import { applyImportedActivities, type ActivityNotice } from './apply';
import { notifyActivities } from './events';

/** Recent gym sessions checked against imported strength activities. */
const GYM_SESSIONS_FOR_DEDUPE = 30;

/**
 * Runs after every sync: applies activities that are new on this device to the local plan, stores
 * the links and announces them. The plan save marks the changed workouts dirty, so the next push
 * brings "done" and the rebalanced sessions to the user's other devices.
 */
export async function processNewActivities(today = todayIso()): Promise<ActivityNotice[]> {
  const [stored, records, links, gym] = await Promise.all([
    planRepo.getPlan(),
    activityRepo.listActivities(),
    activityRepo.listLinks(),
    gymRepo.getGymHistory(GYM_SESSIONS_FOR_DEDUPE),
  ]);
  const outcome = applyImportedActivities(stored, records, links, today, gym.sessions);
  if (stored && outcome.state) await planRepo.savePlanState(stored.id, outcome.state);
  if (stored) activityRepo.addLinks(stored.id, outcome.links);
  activityRepo.markHandled(outcome.handled);
  notifyActivities(outcome.notices);
  return outcome.notices;
}
