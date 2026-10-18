import { zoneConfig } from './config';
import { assertDefined, checkRange, type Result, type ValidationIssue } from './result';
import { paceZonesFromBoundaries, type PaceZone } from './zones';

const cfg = zoneConfig.swim;

export type CssField = 'time400Sec' | 'time200Sec';

export interface CssInput {
  /** All-out 400 m time trial in seconds. */
  time400Sec?: number;
  /** All-out 200 m time trial in seconds (after recovery). */
  time200Sec?: number;
}

export interface CssResult {
  /** Critical Swim Speed in metres per second. */
  cssMetersPerSec: number;
  /** CSS pace in whole seconds per 100 m. */
  cssPacePer100mSec: number;
  /** Pace zones in seconds per 100 m. */
  zones: PaceZone[];
}

/** CSS = (400 − 200) / (T400 − T200); pace per 100 m = (T400 − T200) / 2. */
export function calculateCss(input: CssInput): Result<CssResult, CssField> {
  const issues: ValidationIssue<CssField>[] = [];
  if (input.time400Sec === undefined) issues.push({ field: 'time400Sec', code: 'required' });
  if (input.time200Sec === undefined) issues.push({ field: 'time200Sec', code: 'required' });
  const t400 = checkRange(issues, 'time400Sec', input.time400Sec, cfg.limits.time400Sec);
  const t200 = checkRange(issues, 'time200Sec', input.time200Sec, cfg.limits.time200Sec);

  if (t400 !== undefined && t200 !== undefined) {
    if (t400 <= 2 * t200) {
      issues.push({ field: 'time400Sec', code: 'swim400NotSlowerThan200' });
    } else if (t400 / t200 > cfg.maxRatio400To200) {
      issues.push({ field: 'time400Sec', code: 'swimTimesInconsistent' });
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  const delta = assertDefined(t400, 'time400Sec') - assertDefined(t200, 'time200Sec');
  const pacePer100 = delta / 2;
  return {
    ok: true,
    value: {
      cssMetersPerSec: 200 / delta,
      cssPacePer100mSec: Math.round(pacePer100),
      zones: paceZonesFromBoundaries(cfg.paceZoneOffsetsSecPer100m.map((o) => pacePer100 + o)),
    },
  };
}
