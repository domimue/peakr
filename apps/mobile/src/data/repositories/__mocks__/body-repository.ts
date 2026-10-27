import type { BodyProfile } from '@peakr/engine';

import type {
  FoodItem,
  FoodItemDraft,
  Meal,
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
  DayKcal,
  Measurement,
  MeasurementDraft,
} from '@/data/repositories/body-repository';
import { DEFAULT_CHECKIN_SETTINGS, type CheckInSettings } from '@/features/body/check-in-settings';
import { DEFAULT_ENERGY_SETTINGS, type EnergySettings } from '@/features/body/energy-settings';

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
  foods: [] as FoodItem[],
  measurements: [] as Measurement[],
  dayKcal: [] as DayKcal[],
  checkInSettings: DEFAULT_CHECKIN_SETTINGS as CheckInSettings,
  energySettings: DEFAULT_ENERGY_SETTINGS as EnergySettings,
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
  store.foods = [];
  store.measurements = [];
  store.dayKcal = [];
  store.checkInSettings = DEFAULT_CHECKIN_SETTINGS;
  store.energySettings = DEFAULT_ENERGY_SETTINGS;
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
const ENTRY_DEFAULTS = {
  carbsG: null,
  fatG: null,
  foodId: null,
  amount: null,
  unit: null,
  portionLabel: null,
} as const;

export const addFood = jest.fn(async (draft: FoodDraft) => {
  const entry: FoodEntry = {
    ...ENTRY_DEFAULTS,
    ...draft,
    id: `food-${++seq}`,
    createdAt: '2026-10-26T08:00:00Z',
  };
  store.food.push(entry);
  const item = draft.foodId ? store.foods.find((f) => f.id === draft.foodId) : undefined;
  if (item) item.lastUsedAt = `2026-10-26T08:00:${String(seq).padStart(2, '0')}Z`;
  return entry;
});

export const copyEntries = jest.fn(
  async (input: { fromDay: string; toDay: string; meal?: Meal; toMeal?: Meal }) => {
    const source = store.food.filter(
      (e) => e.day === input.fromDay && (!input.meal || e.meal === input.meal),
    );
    const copies = [];
    for (const { id: _id, createdAt: _at, day: _day, ...e } of source) {
      copies.push(await addFood({ ...e, day: input.toDay, meal: input.toMeal ?? e.meal }));
    }
    return copies;
  },
);

export const getFoodItem = jest.fn(
  async (id: string) => store.foods.find((f) => f.id === id) ?? null,
);
export const foodByBarcode = jest.fn(async (barcode: string) => {
  const rows = store.foods.filter((f) => f.barcode === barcode);
  return rows.find((f) => f.kind !== 'off') ?? rows[0] ?? null;
});
export const searchFoodItems = jest.fn(async (query: string) => {
  const q = query.trim().toLowerCase();
  return store.foods.filter(
    (f) => f.name.toLowerCase().includes(q) || (f.brand ?? '').toLowerCase().includes(q),
  );
});
export const recentFoodItems = jest.fn(async () =>
  store.foods
    .filter((f) => f.lastUsedAt)
    .sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '')),
);
export const listFoodItems = jest.fn(async (filter: 'favourites' | 'custom' | 'recipes') =>
  store.foods.filter((f) =>
    filter === 'favourites' ? f.favourite : f.kind === (filter === 'custom' ? 'custom' : 'recipe'),
  ),
);
export const saveFoodItem = jest.fn(async (draft: FoodItemDraft) => {
  const id = draft.id ?? `item-${++seq}`;
  const existing = store.foods.find((f) => f.id === id);
  const item: FoodItem = {
    ...draft,
    id,
    favourite: draft.favourite ?? existing?.favourite ?? false,
    lastUsedAt: existing?.lastUsedAt ?? null,
    createdAt: existing?.createdAt ?? '2026-10-26T08:00:00Z',
  };
  store.foods = [...store.foods.filter((f) => f.id !== id), item];
  return item;
});
export const setFavourite = jest.fn(async (id: string, favourite: boolean) => {
  const f = store.foods.find((x) => x.id === id);
  if (f) f.favourite = favourite;
});
export const deleteFoodItem = jest.fn(async (id: string) => {
  store.foods = store.foods.filter((f) => f.id !== id);
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
export const updateCheckIn = jest.fn(
  async (id: string, patch: Partial<Pick<CheckIn, 'day' | 'weightKg' | 'bodyFatPct' | 'note'>>) => {
    store.checkIns = store.checkIns.map((c) => (c.id === id ? { ...c, ...patch } : c));
  },
);
export const deleteCheckIn = jest.fn(async (id: string) => {
  store.checkIns = store.checkIns.filter((c) => c.id !== id);
});

export const listMeasurements = jest.fn(async () =>
  [...store.measurements].sort((a, b) => a.day.localeCompare(b.day)),
);
export const getMeasurement = jest.fn(
  async (id: string) => store.measurements.find((m) => m.id === id) ?? null,
);
/** Photos keep the picked uri as their "local copy". */
export const saveMeasurement = jest.fn(async (draft: MeasurementDraft) => {
  const id = draft.id ?? `m-${++seq}`;
  const existing = store.measurements.find((m) => m.id === id);
  const photos = { ...(existing?.photos ?? {}) };
  for (const [slot, uri] of Object.entries(draft.photos ?? {})) {
    const key = slot as keyof Measurement['photos'];
    if (uri === null) delete photos[key];
    else if (uri !== undefined) photos[key] = { localUri: uri, remotePath: null };
  }
  const m: Measurement = {
    ...draft,
    id,
    photos,
    createdAt: existing?.createdAt ?? '2026-10-26T08:00:00Z',
  };
  store.measurements = [...store.measurements.filter((x) => x.id !== id), m];
  return m;
});
export const deleteMeasurement = jest.fn(async (id: string) => {
  store.measurements = store.measurements.filter((m) => m.id !== id);
});
export const listDayKcal = jest.fn(async () => [...store.dayKcal]);
export const setDayKcal = jest.fn(async (entry: DayKcal) => {
  store.dayKcal = [...store.dayKcal.filter((d) => d.day !== entry.day), entry];
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

export const getEnergySettings = jest.fn(async () => ({ ...store.energySettings }));
export const saveEnergySettings = jest.fn(async (settings: EnergySettings) => {
  store.energySettings = { ...settings };
});
export const getCheckInSettings = jest.fn(async () => ({ ...store.checkInSettings }));
export const saveCheckInSettings = jest.fn(async (settings: CheckInSettings) => {
  store.checkInSettings = { ...settings };
});
