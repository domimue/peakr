import type { CustomExercise, Routine } from '@peakr/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as repo from '@/data/repositories/strength-repository';

/** TanStack Query hooks over the local strength repository. */

export const strengthKeys = {
  setup: ['strength', 'setup'] as const,
  routines: ['strength', 'routines'] as const,
  customExercises: ['strength', 'customExercises'] as const,
  logs: ['strength', 'logs'] as const,
};

export function useStrengthSetup() {
  return useQuery({ queryKey: strengthKeys.setup, queryFn: repo.getStrengthSetup });
}

export function useSaveStrengthSetup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: repo.saveStrengthSetup,
    onSuccess: () => client.invalidateQueries({ queryKey: strengthKeys.setup }),
  });
}

export function useRoutines() {
  return useQuery({ queryKey: strengthKeys.routines, queryFn: repo.listRoutines });
}

export function useSaveRoutine() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (routine: Routine) => repo.saveRoutine(routine),
    onSuccess: () => client.invalidateQueries({ queryKey: strengthKeys.routines }),
  });
}

export function useDeleteRoutine() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteRoutine(id),
    onSuccess: () => client.invalidateQueries({ queryKey: strengthKeys.routines }),
  });
}

export function useCustomExercises() {
  return useQuery({ queryKey: strengthKeys.customExercises, queryFn: repo.listCustomExercises });
}

export function useSaveCustomExercise() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (exercise: CustomExercise) => repo.saveCustomExercise(exercise),
    onSuccess: () => client.invalidateQueries({ queryKey: strengthKeys.customExercises }),
  });
}

export function useStrengthLogs() {
  return useQuery({ queryKey: strengthKeys.logs, queryFn: () => repo.listStrengthLogs() });
}

export function useSaveStrengthLog() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (entry: repo.StrengthLogEntry) => repo.saveStrengthLog(entry),
    onSuccess: () => client.invalidateQueries({ queryKey: strengthKeys.logs }),
  });
}
