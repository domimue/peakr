import { describe, expect, it } from 'vitest';

import { logoColors } from './brand';
import {
  colors,
  schemes,
  sportColors,
  status,
  statusText,
  zoneColors,
  type ColorScheme,
} from './colors';
import { contrastRatio, hue, luminance } from './contrast';
import { lockup, markStrokeWidth, wordmark, wordmarkWidth } from './logo';

const SCHEMES: ColorScheme[] = ['dark', 'light'];

describe('contrast', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('rejects malformed colours', () => {
    expect(() => luminance('#FFF')).toThrow();
  });

  it('computes hue', () => {
    expect(hue('#FF0000')).toBe(0);
    expect(hue('#00FF00')).toBe(120);
    expect(hue('#0000FF')).toBe(240);
    expect(hue('#808080')).toBe(0);
  });
});

describe.each(SCHEMES)('%s theme text contrast', (name) => {
  const c = schemes[name];

  it.each(['bg', 'surface', 'surface2'] as const)('text and textMuted on %s ≥ 4.5', (bg) => {
    expect(contrastRatio(c.text, c[bg])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.textMuted, c[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['bg', 'surface', 'surface2'] as const)('status text on %s ≥ 4.5', (bg) => {
    for (const key of ['error', 'warning', 'info'] as const) {
      expect(contrastRatio(statusText[name][key], c[bg])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('accentLine is readable on bg/surface and never Volt on light', () => {
    expect(contrastRatio(c.accentLine, c.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.accentLine, c.surface)).toBeGreaterThanOrEqual(4.5);
    if (name === 'light') expect(c.accentLine).not.toBe(colors.volt);
  });

  it('onAccent on accent (and pressed) ≥ 4.5', () => {
    expect(contrastRatio(c.onAccent, c.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.onAccent, c.accentPressed)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('status colours', () => {
  it('base status colours are below 4.5 on white – that is why light uses *Text variants', () => {
    for (const value of Object.values(status)) {
      expect(contrastRatio(value, colors.white)).toBeLessThan(4.5);
    }
  });
});

describe.each(SCHEMES)('%s zone scale', (name) => {
  const zones = zoneColors[name];

  it('has five steps, each ≥ 3:1 against bg and surface (graphics contrast)', () => {
    expect(zones).toHaveLength(5);
    for (const zone of zones) {
      expect(contrastRatio(zone, colors[name].bg)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(zone, colors[name].surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('every pair of steps differs clearly in hue or lightness', () => {
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const a = zones[i] as string;
        const b = zones[j] as string;
        const diff = Math.abs(hue(a) - hue(b));
        const hueDiff = Math.min(diff, 360 - diff);
        const separable = hueDiff >= 18 || contrastRatio(a, b) >= 1.5;
        expect(separable, `${a} vs ${b}`).toBe(true);
      }
    }
  });
});

describe.each(SCHEMES)('%s sport colours', (name) => {
  const values = Object.values(sportColors[name]);

  it('are ≥ 3:1 against bg and surface and never Volt', () => {
    for (const c of values) {
      expect(contrastRatio(c, colors[name].bg)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(c, colors[name].surface)).toBeGreaterThanOrEqual(3);
      expect(c).not.toBe(colors.volt);
    }
  });

  it('differ clearly from each other', () => {
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        const a = values[i] as string;
        const b = values[j] as string;
        const dh = Math.min(Math.abs(hue(a) - hue(b)), 360 - Math.abs(hue(a) - hue(b)));
        expect(dh >= 25 || contrastRatio(a, b) >= 1.5, `${a} vs ${b}`).toBe(true);
      }
    }
  });
});

it('Z2 is Volt in the dark theme, never Volt in the light theme', () => {
  expect(zoneColors.dark[1]).toBe(colors.volt);
  expect(zoneColors.light).not.toContain(colors.volt);
});

describe('logo', () => {
  it('scales the stroke as 10/120 of the size', () => {
    expect(markStrokeWidth(120)).toBe(10);
    expect(markStrokeWidth(24)).toBe(2);
  });

  it('keeps the wordmark aspect ratio', () => {
    expect(wordmarkWidth(wordmark.height)).toBeCloseTo(wordmark.width);
  });

  it('lays out the lockup as mark 64 / gap 14 / wordmark at font size 50', () => {
    expect(lockup.mark.size).toBe(64);
    expect(lockup.wordmark.x).toBe(78);
    expect(lockup.mark.y + lockup.mark.size / 2).toBeCloseTo(lockup.height / 2);
  });

  it('applies the colour rules', () => {
    expect(logoColors('onDark')).toEqual({ mark: colors.volt, wordmark: colors.white });
    expect(logoColors('onLight')).toEqual({ mark: colors.ink, wordmark: colors.ink });
    expect(logoColors('onAccent').mark).toBe(colors.ink);
  });
});
