import { exercises } from '@peakr/engine';

import { FIGURES } from '../figures/poses';
import { figureSvg } from '../figures/render';
import { reachErrors, solvePose, type PoseSpec } from '../figures/skeleton';

const colors = { body: 'currentColor', equipment: 'currentColor' };

describe('exercise figures', () => {
  it('has a figure for every library exercise and none for unknown ids', () => {
    const ids = new Set(exercises.map((e) => e.id));
    expect(exercises.filter((e) => !FIGURES[e.id]).map((e) => e.id)).toEqual([]);
    expect(Object.keys(FIGURES).filter((id) => !ids.has(id))).toEqual([]);
  });

  // Straight limbs aim a little past their reach on purpose; far beyond it is a pose mistake.
  it('every hand and foot target is within reach (no stretched limbs by mistake)', () => {
    const tooFar: string[] = [];
    for (const [id, def] of Object.entries(FIGURES)) {
      for (const [frame, pose] of [
        ['start', def.start],
        ['end', def.end],
      ] as [string, PoseSpec][]) {
        const worst = Math.max(...reachErrors(pose));
        if (worst > 10) tooFar.push(`${id} ${frame} +${worst.toFixed(1)}`);
      }
    }
    expect(tooFar).toEqual([]);
  });

  it('every pose stays inside the 120 × 120 box', () => {
    const outside: string[] = [];
    for (const [id, def] of Object.entries(FIGURES)) {
      for (const pose of [def.start, def.end]) {
        for (const [joint, [x, y]] of Object.entries(solvePose(pose))) {
          if (x < 0 || x > 120 || y < 0 || y > 113)
            outside.push(`${id} ${joint} ${x.toFixed(0)},${y.toFixed(0)}`);
        }
      }
    }
    expect(outside).toEqual([]);
  });

  it('renders valid SVG without hard-coded colours', () => {
    const svg = figureSvg(FIGURES.back_squat!, colors);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 120 120"');
    expect(svg).not.toMatch(/#[0-9a-f]{3,6}/i);
    for (const def of Object.values(FIGURES)) expect(figureSvg(def, colors)).not.toContain('NaN');
  });
});
