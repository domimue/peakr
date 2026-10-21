import { roundToStep } from '@peakr/engine';

/** Number formats of the gym screens (tabular figures come from `Text`). */

/** Elapsed or remaining time: `4:05`, `1:02:09`. */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** A weight in kg without float noise: `82.5`, `21`, `1.25`. */
export function formatKg(kg: number): string {
  return String(roundToStep(kg, 0.01));
}

/** Volume, rounded to whole kg with thousands separators: `12,480`. */
export function formatVolume(kg: number, locale?: string): string {
  return Math.round(kg).toLocaleString(locale);
}

/** One set as text: `80 × 8`, `12`, `45 s`. */
export function formatSet(
  set: { weightKg?: number; reps?: number; durationSec?: number },
  secUnit: string,
): string {
  const amount =
    set.reps !== undefined
      ? String(set.reps)
      : set.durationSec !== undefined
        ? `${set.durationSec} ${secUnit}`
        : '';
  if (set.weightKg)
    return amount ? `${formatKg(set.weightKg)} × ${amount}` : formatKg(set.weightKg);
  return amount;
}

/** Text of a keypad entry → number (empty or invalid → undefined). */
export function parseEntry(text: string): number | undefined {
  if (text.trim() === '') return undefined;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** A stored number back into keypad text. */
export function entryText(n: number | undefined): string {
  return n === undefined ? '' : formatKg(n);
}
