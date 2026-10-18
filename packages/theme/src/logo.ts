import { wordmark } from './logo.generated';

/** "Pulse Peak" mark: exact geometry in a 120×120 box. Never change, outline or distort it. */
export const mark = {
  viewBox: 120,
  points: '6,82 30,82 38,70 45,92 60,22 75,92 82,70 90,82 114,82',
  strokeWidth: 10,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Stroke width always scales with the mark: 10/120 of its size. */
export function markStrokeWidth(size: number): number {
  return (size * mark.strokeWidth) / mark.viewBox;
}

/** Outlined "peakr" wordmark (Peakr-Display, tracking −0.03em) at font size 50, tight bounding box. */
export { wordmark };

/** Wordmark width for a given rendered height (keeps the aspect ratio). */
export function wordmarkWidth(height: number): number {
  return (height * wordmark.width) / wordmark.height;
}

/** Lockup proportions: mark 64, wordmark font size 50, gap 14 – scaled together. */
export const lockupProportions = { mark: 64, fontSize: 50, gap: 14 } as const;

/**
 * Lockup layout in its own coordinate system (height = mark size 64). Mark left, wordmark right,
 * both vertically centred. Scale the whole thing via the SVG viewBox.
 */
export const lockup = (() => {
  const { mark: markSize, gap } = lockupProportions;
  const scale = lockupProportions.fontSize / wordmark.fontSize;
  const wordWidth = wordmark.width * scale;
  const wordHeight = wordmark.height * scale;
  const height = Math.max(markSize, wordHeight);
  return {
    width: markSize + gap + wordWidth,
    height,
    mark: { x: 0, y: (height - markSize) / 2, size: markSize },
    wordmark: { x: markSize + gap, y: (height - wordHeight) / 2, scale },
  };
})();

export type LogoVariant = 'lockup' | 'mark' | 'wordmark';
export type LogoTone = 'onLight' | 'onDark' | 'onAccent';
