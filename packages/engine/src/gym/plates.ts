/**
 * Plate calculator (CLAUDE.md "Gym"): which plates go on each side of the bar for a target weight,
 * with a configurable bar and the plates the gym actually has.
 */

export interface PlateStock {
  kg: number;
  /** Plates of this weight in total (both sides); a side gets half. */
  count: number;
}

export interface PlateSetup {
  barKg: number;
  plates: PlateStock[];
}

export const DEFAULT_PLATE_SETUP: PlateSetup = {
  barKg: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25].map((kg) => ({ kg, count: 8 })),
};

export interface PlateLoad {
  /** Plates for one side, heaviest first. */
  perSide: number[];
  /** Weight actually loaded (bar + both sides). */
  totalKg: number;
  /** Target − loaded; > 0 when the plates cannot make the exact weight. */
  missingKg: number;
  /** Target lighter than the bar. */
  belowBar: boolean;
}

/** Hundredths of a kg, so 1.25 kg plates add up without float noise. */
const cents = (kg: number) => Math.round(kg * 100);

/**
 * Greedy from the heaviest plate, which is exact for the usual plate series. Plates are used in
 * pairs; with an odd stock the extra one stays on the rack.
 */
export function platesPerSide(
  targetKg: number,
  setup: PlateSetup = DEFAULT_PLATE_SETUP,
): PlateLoad {
  const bar = cents(setup.barKg);
  const target = cents(targetKg);
  if (target < bar) {
    return { perSide: [], totalKg: setup.barKg, missingKg: 0, belowBar: true };
  }
  let side = Math.floor((target - bar) / 2);
  const perSide: number[] = [];
  const stock = [...setup.plates]
    .filter((p) => p.kg > 0 && p.count >= 2)
    .sort((a, b) => b.kg - a.kg);
  for (const plate of stock) {
    const w = cents(plate.kg);
    const n = Math.min(Math.floor(side / w), Math.floor(plate.count / 2));
    for (let i = 0; i < n; i++) perSide.push(plate.kg);
    side -= n * w;
  }
  const loaded = bar + 2 * perSide.reduce((sum, kg) => sum + cents(kg), 0);
  return {
    perSide,
    totalKg: loaded / 100,
    missingKg: (target - loaded) / 100,
    belowBar: false,
  };
}
