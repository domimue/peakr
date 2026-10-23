import type { WatchChoice } from '../../../features/watch/options';

/** In-memory watch choice for Jest (`jest.mock('@/data/repositories/watch-repository')`). */

export const store = { choice: null as WatchChoice | null };

export function resetStore(): void {
  store.choice = null;
}

export const getWatchChoice = jest.fn(async () => store.choice);
export const saveWatchChoice = jest.fn(async (choice: WatchChoice) => {
  store.choice = choice;
});
