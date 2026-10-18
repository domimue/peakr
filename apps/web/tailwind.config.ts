import { colors, fontSizes, schemes, typography, type SchemeColors } from '@peakr/theme';
import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

/**
 * Design tokens from @peakr/theme → Tailwind. Loaded from globals.css via `@config`.
 * Semantic colours are CSS variables so a subtree can switch scheme with `.theme-dark`
 * (pages are light, header / hero / footer are dark). No colour values live in the web app itself.
 */

const SEMANTIC: Record<string, keyof SchemeColors> = {
  background: 'bg',
  surface: 'surface',
  'surface-2': 'surface2',
  border: 'border',
  foreground: 'text',
  muted: 'textMuted',
  accent: 'accent',
  'accent-pressed': 'accentPressed',
  'accent-line': 'accentLine',
  'on-accent': 'onAccent',
  error: 'error',
  warning: 'warning',
  info: 'info',
  'error-text': 'errorText',
  'warning-text': 'warningText',
  'info-text': 'infoText',
  'zone-1': 'zone1',
  'zone-2': 'zone2',
  'zone-3': 'zone3',
  'zone-4': 'zone4',
  'zone-5': 'zone5',
};

function cssVariables(scheme: SchemeColors): Record<string, string> {
  return Object.fromEntries(
    Object.entries(SEMANTIC).map(([name, key]) => [`--color-${name}`, scheme[key]]),
  );
}

const px = (n: number) => `${n}px`;
const lineHeight = (variant: keyof typeof typography) => px(typography[variant].lineHeight);

export default {
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      volt: colors.volt,
      ink: colors.ink,
      white: colors.white,
      ...Object.fromEntries(Object.keys(SEMANTIC).map((name) => [name, `var(--color-${name})`])),
    },
    // Type scale 12 / 14 / 16 / 20 / 24 / 32 / 44.
    fontSize: {
      xs: [px(fontSizes.xs), { lineHeight: lineHeight('micro') }],
      sm: [px(fontSizes.sm), { lineHeight: lineHeight('caption') }],
      base: [px(fontSizes.md), { lineHeight: lineHeight('body') }],
      lg: [px(fontSizes.lg), { lineHeight: lineHeight('heading') }],
      xl: [px(fontSizes.xl), { lineHeight: lineHeight('subtitle') }],
      '2xl': [px(fontSizes.xxl), { lineHeight: lineHeight('title') }],
      '3xl': [px(fontSizes.display), { lineHeight: lineHeight('display') }],
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-archivo)', 'system-ui', 'sans-serif'],
        display: ['var(--font-peakr-display)', 'var(--font-archivo)', 'system-ui', 'sans-serif'],
      },
      borderRadius: { button: '14px' },
      borderWidth: { '1.5': '1.5px' },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ':root': cssVariables(schemes.light),
        '.theme-dark': { ...cssVariables(schemes.dark), colorScheme: 'dark' },
      });
    }),
  ],
} satisfies Config;
