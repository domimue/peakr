import { useColorScheme } from 'react-native';

import { useSettingsStore } from '@/features/settings/settings-store';

import { colors, type ColorScheme, type ThemeColors } from './colors';

export interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
}

/** Resolves the appearance preference (system / light / dark) to a concrete theme. */
export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const preference = useSettingsStore((s) => s.themePreference);
  const scheme: ColorScheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
  return { scheme, colors: colors[scheme] };
}
