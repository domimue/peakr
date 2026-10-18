import { create } from 'zustand';

export type ThemePreference = 'system' | 'light' | 'dark';

interface SettingsState {
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
}

// In-memory for now; persisted to SQLite once the settings repository exists.
export const useSettingsStore = create<SettingsState>()((set) => ({
  // The app is dark by default; light mode is optional.
  themePreference: 'dark',
  setThemePreference: (themePreference) => set({ themePreference }),
}));
