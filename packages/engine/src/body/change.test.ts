import { describe, expect, it } from 'vitest';

import { changeTone } from './change';

describe('changeTone: favourable depends on the metric and the goal', () => {
  it('losing weight: down is favourable for weight and trunk, limbs are not judged', () => {
    expect(changeTone('weight', 'lose', -0.6)).toBe('favourable');
    expect(changeTone('weight', 'lose', 0.6)).toBe('unfavourable');
    expect(changeTone('waist', 'lose', -2)).toBe('favourable');
    expect(changeTone('armL', 'lose', -1)).toBe('neutral');
  });

  it('building muscle: up is favourable for weight, chest and arms; fat is still watched', () => {
    expect(changeTone('weight', 'gain', 0.5)).toBe('favourable');
    expect(changeTone('chest', 'gain', 1)).toBe('favourable');
    expect(changeTone('armR', 'gain', -1)).toBe('unfavourable');
    expect(changeTone('waist', 'gain', 1)).toBe('neutral');
    expect(changeTone('bodyFat', 'gain', 1)).toBe('unfavourable');
  });

  it('maintaining: staying put is favourable, a real change is the one to watch', () => {
    expect(changeTone('weight', 'maintain', 0.1)).toBe('favourable');
    expect(changeTone('weight', 'maintain', -1)).toBe('unfavourable');
    expect(changeTone('hip', 'maintain', 0.4)).toBe('favourable');
  });

  it('noise, missing values, no goal; recovery and habits are the same for every goal', () => {
    expect(changeTone('weight', 'lose', -0.1)).toBe('neutral');
    expect(changeTone('weight', 'lose', null)).toBe('neutral');
    expect(changeTone('weight', null, -2)).toBe('neutral');
    expect(changeTone('restingHr', null, -4)).toBe('favourable');
    expect(changeTone('hrv', 'gain', -10)).toBe('unfavourable');
    expect(changeTone('loggedDays', 'lose', 2)).toBe('favourable');
    expect(changeTone('leanMass', 'lose', 0.5)).toBe('favourable');
  });
});
