import { colors } from './colors';
import type { LogoTone } from './logo';

/**
 * Logo colour rules: on dark (Ink) → mark Volt, wordmark white. On light → both Ink
 * (never Volt as line or text on light). On a Volt surface → Ink.
 */
export function logoColors(tone: LogoTone): { mark: string; wordmark: string } {
  switch (tone) {
    case 'onDark':
      return { mark: colors.volt, wordmark: colors.white };
    case 'onLight':
    case 'onAccent':
      return { mark: colors.ink, wordmark: colors.ink };
  }
}
