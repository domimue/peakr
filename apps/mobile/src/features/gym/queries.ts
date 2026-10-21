import type {
  CustomExercise,
  GymRoutine,
  GymSession,
  GymSet,
  PlateSetup,
  RoutineFolder,
} from '@peakr/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as repo from '@/data/repositories/gym-repository';

/** TanStack Query hooks over the local gym repository. */

export const gymKeys = {
  all: ['gym'] as const,
  exercises: ['gym', 'exercises'] as const,
  folders: ['gym', 'folders'] as const,
  routines: ['gym', 'routines'] as const,
  history: ['gym', 'history'] as const,
  plates: ['gym', 'plates'] as const,
};

function useInvalidating<A>(fn: (arg: A) => Promise<void>, keys: readonly (readonly string[])[]) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey }))),
  });
}

export function useGymExercises() {
  return useQuery({ queryKey: gymKeys.exercises, queryFn: repo.listGymExercises });
}

export function useSaveGymExercise() {
  return useInvalidating((e: CustomExercise) => repo.saveGymExercise(e), [gymKeys.exercises]);
}

export function useDeleteGymExercise() {
  return useInvalidating((id: string) => repo.deleteGymExercise(id), [gymKeys.exercises]);
}

export function useFolders() {
  return useQuery({ queryKey: gymKeys.folders, queryFn: repo.listFolders });
}

export function useSaveFolder() {
  return useInvalidating((f: RoutineFolder) => repo.saveFolder(f), [gymKeys.folders]);
}

export function useDeleteFolder() {
  return useInvalidating(
    (id: string) => repo.deleteFolder(id),
    [gymKeys.folders, gymKeys.routines],
  );
}

export function useGymRoutines() {
  return useQuery({ queryKey: gymKeys.routines, queryFn: repo.listGymRoutines });
}

export function useSaveGymRoutines() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (list: readonly GymRoutine[]) => repo.saveGymRoutines(list),
    // Reordering shows the new order at once instead of jumping back until the write is done.
    onMutate: (list) => {
      const current = client.getQueryData<GymRoutine[]>(gymKeys.routines);
      if (!current) return;
      const byId = new Map(list.map((r) => [r.id, r]));
      const merged = current.map((r) => byId.get(r.id) ?? r);
      const added = list.filter((r) => !current.some((c) => c.id === r.id));
      client.setQueryData(
        gymKeys.routines,
        [...merged, ...added].sort((a, b) => a.position - b.position),
      );
    },
    onSettled: () => client.invalidateQueries({ queryKey: gymKeys.routines }),
  });
}

export function useDeleteGymRoutine() {
  return useInvalidating((id: string) => repo.deleteGymRoutine(id), [gymKeys.routines]);
}

export function useSaveStarterRoutines() {
  return useInvalidating(
    ({ folder, routines }: { folder: RoutineFolder; routines: readonly GymRoutine[] }) =>
      repo.saveFolderWithRoutines(folder, routines),
    [gymKeys.folders, gymKeys.routines],
  );
}

export function useGymHistory() {
  return useQuery({ queryKey: gymKeys.history, queryFn: () => repo.getGymHistory() });
}

export function useSaveGymSession() {
  return useInvalidating(
    ({ session, sets }: { session: GymSession; sets: readonly GymSet[] }) =>
      repo.saveGymSession(session, sets),
    [gymKeys.history],
  );
}

export function useSaveGymImport() {
  return useInvalidating((data: repo.GymImport) => repo.saveGymImport(data), [gymKeys.all]);
}

/** Stores a finished live session and removes the running state (see `finishLiveSession`). */
export function useFinishLiveSession() {
  return useInvalidating(
    ({ session, sets }: { session: GymSession; sets: readonly GymSet[] }) =>
      repo.finishLiveSession(session, sets),
    [gymKeys.history],
  );
}

export function usePlateSetup() {
  return useQuery({ queryKey: gymKeys.plates, queryFn: repo.getPlateSetup });
}

export function useSavePlateSetup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (setup: PlateSetup) => repo.savePlateSetup(setup),
    onMutate: (setup) => client.setQueryData(gymKeys.plates, setup),
    onSettled: () => client.invalidateQueries({ queryKey: gymKeys.plates }),
  });
}
