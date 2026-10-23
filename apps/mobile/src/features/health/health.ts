import type { HealthProvider } from './types';

/** Platforms without a health store (web, tests): everything reports "not available". */
export const health: HealthProvider = {
  store: 'healthConnect',
  isSupported: async () => false,
  hasWritePermission: async () => false,
  requestWritePermission: async () => false,
  writeStrengthWorkout: async () => ({ ok: false, reason: 'unsupported' }),
};
