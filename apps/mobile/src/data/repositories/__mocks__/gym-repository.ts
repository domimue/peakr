import type {
  CustomExercise,
  GymRoutine,
  GymSession,
  GymSessionSource,
  GymSet,
  PlateSetup,
  RoutineFolder,
} from '@peakr/engine';

import type { GymHistory, GymImport } from '../gym-repository';

/** In-memory gym repository for Jest (`jest.mock('@/data/repositories/gym-repository')`). */

export type { GymHistory, GymImport } from '../gym-repository';

export const store = {
  exercises: [] as CustomExercise[],
  folders: [] as RoutineFolder[],
  routines: [] as GymRoutine[],
  sessions: [] as GymSession[],
  sets: [] as GymSet[],
  importNames: {} as Record<string, string>,
};

export function resetStore(): void {
  store.exercises = [];
  store.folders = [];
  store.routines = [];
  store.sessions = [];
  store.sets = [];
  store.importNames = {};
  liveStore.json = null;
  liveStore.plates = null;
}

const upsert = <T extends { id: string }>(list: T[], item: T): T[] =>
  list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? item : x))
    : [...list, item];

export const listGymExercises = jest.fn(async () =>
  [...store.exercises].sort((a, b) => a.name.localeCompare(b.name)),
);
export const saveGymExercise = jest.fn(async (e: CustomExercise) => {
  store.exercises = upsert(store.exercises, e);
});
export const deleteGymExercise = jest.fn(async (id: string) => {
  store.exercises = store.exercises.filter((e) => e.id !== id);
});

export const listFolders = jest.fn(async () =>
  [...store.folders].sort((a, b) => a.position - b.position),
);
export const saveFolder = jest.fn(async (f: RoutineFolder) => {
  store.folders = upsert(store.folders, f);
});
export const deleteFolder = jest.fn(async (id: string) => {
  store.folders = store.folders.filter((f) => f.id !== id);
  store.routines = store.routines.map((r) => {
    if (r.folderId !== id) return r;
    const rest = { ...r };
    delete rest.folderId;
    return rest;
  });
});

export const listGymRoutines = jest.fn(async () =>
  [...store.routines].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
);
export const saveGymRoutines = jest.fn(async (list: readonly GymRoutine[]) => {
  for (const r of list) store.routines = upsert(store.routines, r);
});
export const saveGymRoutine = jest.fn(async (r: GymRoutine) => {
  store.routines = upsert(store.routines, r);
});
export const deleteGymRoutine = jest.fn(async (id: string) => {
  store.routines = store.routines.filter((r) => r.id !== id);
});
export const saveFolderWithRoutines = jest.fn(
  async (folder: RoutineFolder, list: readonly GymRoutine[]) => {
    store.folders = upsert(store.folders, folder);
    for (const r of list) store.routines = upsert(store.routines, r);
  },
);

export const saveGymSession = jest.fn(async (session: GymSession, sets: readonly GymSet[]) => {
  store.sessions = upsert(store.sessions, session);
  store.sets = [...store.sets.filter((s) => s.sessionId !== session.id), ...sets];
});
export const deleteGymSession = jest.fn(async (id: string) => {
  store.sessions = store.sessions.filter((s) => s.id !== id);
  store.sets = store.sets.filter((s) => s.sessionId !== id);
});
export const getGymHistory = jest.fn(async (): Promise<GymHistory> => ({
  sessions: [...store.sessions].sort((a, b) => b.startedAt - a.startedAt),
  sets: [...store.sets],
}));
export const listExternalIds = jest.fn(
  async (source: GymSessionSource) =>
    new Set(
      store.sessions.flatMap((s) => (s.source === source && s.externalId ? [s.externalId] : [])),
    ),
);
export const saveGymImport = jest.fn(async (data: GymImport) => {
  for (const e of data.exercises) store.exercises = upsert(store.exercises, e);
  if (data.folder) store.folders = upsert(store.folders, data.folder);
  for (const r of data.routines) store.routines = upsert(store.routines, r);
  store.sessions = [...store.sessions, ...data.sessions];
  store.sets = [...store.sets, ...data.sets];
});
export const getImportNames = jest.fn(async () => ({ ...store.importNames }));
export const saveImportNames = jest.fn(async (names: Record<string, string>) => {
  store.importNames = { ...names };
});

export const liveStore = { json: null as string | null, plates: null as PlateSetup | null };

export const getLiveSession = jest.fn(async () => liveStore.json);
export const saveLiveSession = jest.fn((json: string) => {
  liveStore.json = json;
});
export const clearLiveSession = jest.fn(() => {
  liveStore.json = null;
});
export const finishLiveSession = jest.fn(async (session: GymSession, sets: readonly GymSet[]) => {
  await saveGymSession(session, sets);
  liveStore.json = null;
});
export const getPlateSetup = jest.fn(async () => liveStore.plates);
export const savePlateSetup = jest.fn(async (setup: PlateSetup) => {
  liveStore.plates = setup;
});
