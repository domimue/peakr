import type { BodyProfile } from '@peakr/engine';

import type {
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
};

let seq = 0;

export function resetStore() {
  store.profile = {};
  store.remoteProfile = {};
  store.food = [];
  store.checkIns = [];
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
