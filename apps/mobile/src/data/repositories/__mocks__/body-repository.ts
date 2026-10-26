import type { BodyProfile } from '@peakr/engine';

import type {
  GoalDraft,
  StoredGoal,
  DeviceBodyMetric,
  DeviceBodyValue,
  StoredTargetChange,
  StoredTdeeEstimate,
  CheckIn,
  CheckInDraft,
  FoodDraft,
  FoodEntry,
} from '@/data/repositories/body-repository';

/** In-memory Body data for Jest (`jest.mock('@/data/repositories/body-repository')`). */

export const store = {
  profile: {} as Partial<BodyProfile>,
  remoteProfile: {} as Partial<BodyProfile>,
  food: [] as FoodEntry[],
  checkIns: [] as CheckIn[],
  incompleteDays: [] as string[],
  tdee: [] as StoredTdeeEstimate[],
  targets: [] as StoredTargetChange[],
  device: [] as DeviceBodyValue[],
  goals: [] as StoredGoal[],
};

let seq = 0;

export function resetStore() {
  store.profile = {};
  store.remoteProfile = {};
  store.food = [];
  store.checkIns = [];
  store.incompleteDays = [];
  store.tdee = [];
  store.targets = [];
  store.device = [];
  store.goals = [];
  seq = 0;
}

export const getProfile = jest.fn(async () => ({ ...store.profile }));
export const saveProfile = jest.fn(async (values: Partial<BodyProfile>) => {
  store.profile = { ...store.profile, ...values };
  return { ...store.profile };
});
export const fetchRemoteProfile = jest.fn(async () => ({ ...store.remoteProfile }));

export const listFood = jest.fn(async (day?: string) =>
  store.food.filter((f) => day === undefined || f.day === day),
);
export const addFood = jest.fn(async (draft: FoodDraft) => {
  const entry = { ...draft, id: `food-${++seq}`, createdAt: '2026-10-26T08:00:00Z' };
  store.food.push(entry);
  return entry;
});
export const deleteFood = jest.fn(async (id: string) => {
  store.food = store.food.filter((f) => f.id !== id);
});

export const listCheckIns = jest.fn(async () => [...store.checkIns]);
export const addCheckIn = jest.fn(async (draft: CheckInDraft) => {
  const checkIn = { ...draft, id: `checkin-${++seq}`, createdAt: '2026-10-26T08:00:00Z' };
  store.checkIns.push(checkIn);
  return checkIn;
});
export const deleteCheckIn = jest.fn(async (id: string) => {
  store.checkIns = store.checkIns.filter((c) => c.id !== id);
});

export const syncBody = jest.fn(async () => false);

export const listIncompleteDays = jest.fn(async () => [...store.incompleteDays]);
export const setDayIncomplete = jest.fn(async (day: string, incomplete: boolean) => {
  store.incompleteDays = store.incompleteDays.filter((d) => d !== day);
  if (incomplete) store.incompleteDays.push(day);
});
export const listTdeeEstimates = jest.fn(async () => [...store.tdee]);
export const saveTdeeEstimate = jest.fn(async (e: StoredTdeeEstimate) => {
  store.tdee = [...store.tdee.filter((x) => x.date !== e.date), e];
});
export const listTargetChanges = jest.fn(async () => [...store.targets]);
export const saveTargetChange = jest.fn(async (c: StoredTargetChange) => {
  store.targets = [...store.targets.filter((x) => x.date !== c.date), c];
});
export const saveDeviceValues = jest.fn(async (rows: readonly DeviceBodyValue[]) => {
  for (const r of rows) {
    store.device = [
      ...store.device.filter(
        (d) => !(d.metric === r.metric && d.day === r.day && d.source === r.source),
      ),
      r,
    ];
  }
});
export const listDeviceValues = jest.fn(async (from: string) =>
  store.device.filter((d) => d.day >= from),
);
export const deleteDeviceValues = jest.fn(async (metrics?: readonly DeviceBodyMetric[]) => {
  store.device = metrics ? store.device.filter((d) => !metrics.includes(d.metric)) : [];
});
export const listGoals = jest.fn(async () => [...store.goals]);
export const saveGoal = jest.fn(async (draft: GoalDraft) => {
  const goal = {
    ...draft,
    id: `goal-${++seq}`,
    createdAt: `2026-10-26T08:00:${String(seq).padStart(2, '0')}Z`,
  };
  store.goals.push(goal);
  return goal;
});
