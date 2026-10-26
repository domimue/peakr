/** A weigh-in with a body fat % (scale, device or manual), using the trend weight of that day. */
export interface CompositionPoint {
  day: string;
  weightKg: number;
  bodyFatPct: number;
}

export interface MassSplit {
  fatKg: number;
  leanKg: number;
}

export type BodyComposition =
  | { status: 'notEnoughData' }
  | { status: 'ok'; start: MassSplit | null; current: MassSplit; change: MassSplit | null };

const round1 = (n: number) => Math.round(n * 10) / 10;
const split = (p: CompositionPoint): MassSplit => {
  const fat = (p.weightKg * p.bodyFatPct) / 100;
  return { fatKg: round1(fat), leanKg: round1(p.weightKg - fat) };
};

/**
 * Fat and lean mass (estimates – body fat scales are imprecise): the current split, and the
 * change since the first measurement when there are two. Without any body fat % there is
 * nothing to estimate.
 */
export function bodyComposition(input: {
  start?: CompositionPoint | null;
  current?: CompositionPoint | null;
}): BodyComposition {
  const current = input.current ?? input.start;
  if (!current) return { status: 'notEnoughData' };
  const now = split(current);
  const start =
    input.start && input.current && input.start.day < input.current.day ? split(input.start) : null;
  return {
    status: 'ok',
    start,
    current: now,
    change: start
      ? { fatKg: round1(now.fatKg - start.fatKg), leanKg: round1(now.leanKg - start.leanKg) }
      : null,
  };
}
