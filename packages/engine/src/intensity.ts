import { zoneConfig } from './config';
import { estimateHrMax, type HrZone } from './hr';
import type { ZoneNumber } from './zones';

const cfg = zoneConfig.hr.prescription;

/**
 * The physiological intent of a session step. Steps keep their zone number for the load model;
 * what the athlete is told to hold comes from the intensity's bpm band (`prescriptionBands`).
 */
export type Intensity5 = 'recovery' | 'easy' | 'tempo' | 'threshold' | 'vo2';

export const ZONE_INTENSITY: Readonly<Record<ZoneNumber, Intensity5>> = {
  1: 'recovery',
  2: 'easy',
  3: 'tempo',
  4: 'threshold',
  5: 'vo2',
};

export interface HrAnchors {
  lthr?: number;
  restingHr?: number;
  hrMax?: number;
  /** For the HRmax estimate when HRmax is not known. */
  age?: number;
}

export type BandAnchor = 'lthr' | 'hrReserve' | 'hrMax';

export interface PrescriptionBand extends HrZone {
  intensity: Intensity5;
  /** Where the band comes from; `custom` = the user's own range for this intensity. */
  anchor: BandAnchor | 'custom';
}

/** The LTHR the bands hang on and how it was found; null without any heart-rate input. */
export function bandAnchor(
  a: HrAnchors,
): { lthr: number; anchor: BandAnchor; hrMax: number | null } | null {
  const hrMax = a.hrMax ?? (a.age !== undefined ? estimateHrMax(a.age) : undefined);
  if (a.lthr !== undefined) return { lthr: a.lthr, anchor: 'lthr', hrMax: hrMax ?? null };
  if (hrMax === undefined) return null;
  if (a.restingHr !== undefined && a.restingHr < hrMax) {
    const lthr = a.restingHr + cfg.lthrShareOfReserve * (hrMax - a.restingHr);
    return { lthr, anchor: 'hrReserve', hrMax };
  }
  return { lthr: cfg.lthrShareOfHrMax * hrMax, anchor: 'hrMax', hrMax };
}

/**
 * The bpm band each zone number of a session prescribes – the same whichever display method the
 * user picked for the zone table (%HRmax, Karvonen, LTHR). Ranges the user set by hand for a zone
 * win over the calculated band (their own entry always wins). Empty without heart-rate input.
 */
export function prescriptionBands(
  anchors: HrAnchors,
  custom: Partial<Record<ZoneNumber, { minBpm: number; maxBpm: number }>> = {},
): PrescriptionBand[] {
  const base = bandAnchor(anchors);
  if (!base) return [];
  const f = cfg.lthrFractions;
  const b = f.map((x) => Math.round(x * base.lthr));
  const top =
    base.hrMax === null ? (b[5] as number) : Math.min(b[5] as number, Math.round(base.hrMax));
  const zones: [number, number][] = [
    [b[0] as number, (b[1] as number) - 1],
    [b[1] as number, (b[2] as number) - 1],
    [b[2] as number, (b[3] as number) - 1],
    [b[3] as number, (b[4] as number) - 1],
    [b[4] as number, Math.max(b[4] as number, top)],
  ];
  return zones.map(([minBpm, maxBpm], i) => {
    const zone = (i + 1) as ZoneNumber;
    const own = custom[zone];
    return {
      zone,
      intensity: ZONE_INTENSITY[zone],
      minBpm: own?.minBpm ?? minBpm,
      maxBpm: own?.maxBpm ?? maxBpm,
      anchor: own ? 'custom' : base.anchor,
    };
  });
}
