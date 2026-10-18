/** Formats seconds as `h:mm:ss` (≥ 1 hour) or `m:ss`. Rounds to whole seconds. */
export function formatDuration(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) {
    throw new RangeError(`duration must be a non-negative number, got ${totalSec}`);
  }
  const rounded = Math.round(totalSec);
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
