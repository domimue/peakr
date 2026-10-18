import { describe, expect, it } from 'vitest';

import { bpmRange, hrRows, paceRange, paceRows } from '../format';

describe('zone formatting', () => {
  it('formats closed and open-ended bpm ranges', () => {
    expect(bpmRange({ minBpm: 112, maxBpm: 130 })).toBe('112–130 bpm');
    expect(bpmRange({ minBpm: null, maxBpm: 144 })).toBe('up to 144 bpm');
    expect(bpmRange({ minBpm: 170, maxBpm: null })).toBe('170+ bpm');
  });

  it('formats closed and open-ended pace ranges', () => {
    expect(paceRange({ zone: 3, slowestSec: 330, fastestSec: 310 }, '/km')).toBe('5:30–5:10 /km');
    expect(paceRange({ zone: 1, slowestSec: null, fastestSec: 391 }, '/km')).toBe(
      '6:31 /km or slower',
    );
    expect(paceRange({ zone: 5, slowestSec: 95, fastestSec: null }, '/100 m')).toBe(
      '1:35 /100 m or faster',
    );
  });

  it('builds labelled rows and highlights one zone', () => {
    const rows = hrRows(
      [
        { zone: 1, minBpm: 94, maxBpm: 111 },
        { zone: 2, minBpm: 112, maxBpm: 130 },
      ],
      2,
    );
    expect(rows).toEqual([
      { zone: 1, label: 'Z1', name: 'Recovery', range: '94–111 bpm', highlighted: false },
      { zone: 2, label: 'Z2', name: 'Endurance', range: '112–130 bpm', highlighted: true },
    ]);
    expect(paceRows([{ zone: 5, slowestSec: 95, fastestSec: null }], '/100 m')[0]).toEqual({
      zone: 5,
      label: 'Z5',
      name: 'VO₂max',
      range: '1:35 /100 m or faster',
    });
  });
});
