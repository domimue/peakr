import type { StoredStrengthSetup } from '../strength-repository';

/** In-memory strength repository for Jest (`jest.mock('@/data/repositories/strength-repository')`). */

export type { StoredStrengthSetup } from '../strength-repository';

export const store = {
  setup: null as StoredStrengthSetup | null,
};

export function resetStore(): void {
  store.setup = null;
}

export const getStrengthSetup = jest.fn(async () => store.setup);
export const saveStrengthSetup = jest.fn(async (setup: StoredStrengthSetup) => {
  store.setup = setup;
});
