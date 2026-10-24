import {
  CSV_FIELDS,
  EQUIPMENT,
  EXERCISE_PATTERNS,
  exercises,
  MUSCLE_GROUPS,
  STARTER_SPLITS,
  TRACKING_MODES,
} from '@peakr/engine';

import { enExercises, enMessages as en } from '@/i18n/messages';

import { PATTERN_ICONS } from '../exercise-text';

function lookup(key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
}

const texts = enExercises as Record<
  string,
  { name: string; aliases: string[]; instructions: string; cues: string[]; mistakes: string[] }
>;

describe('exercise library texts', () => {
  it('every library exercise has a name, instructions, 2–3 cues and common mistakes', () => {
    for (const e of exercises) {
      const x = texts[e.id];
      expect(x).toBeDefined();
      expect(x?.name.trim()).not.toBe('');
      expect(x?.instructions.length).toBeGreaterThan(40);
      expect(x?.cues.length).toBeGreaterThanOrEqual(2);
      expect(x?.cues.length).toBeLessThanOrEqual(3);
      expect(x?.mistakes.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(x?.aliases)).toBe(true);
    }
  });

  it('has no texts for exercises that do not exist, and unique names', () => {
    const ids = new Set(exercises.map((e) => e.id));
    expect(Object.keys(texts).filter((id) => !ids.has(id))).toEqual([]);
    const names = Object.values(texts).map((x) => x.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('gym translations', () => {
  it('names every pattern, piece of equipment, muscle, tracking mode, split and CSV column', () => {
    for (const p of EXERCISE_PATTERNS) {
      expect(typeof lookup(`strength.patterns.${p}`)).toBe('string');
      expect(PATTERN_ICONS[p]).toBeDefined();
    }
    for (const e of EQUIPMENT) expect(typeof lookup(`strength.equipment.${e}`)).toBe('string');
    for (const m of MUSCLE_GROUPS) expect(typeof lookup(`gym.muscles.${m}`)).toBe('string');
    for (const m of TRACKING_MODES) expect(typeof lookup(`gym.tracking.${m}`)).toBe('string');
    for (const s of STARTER_SPLITS) expect(typeof lookup(`gym.starter.splits.${s}`)).toBe('string');
    for (const f of CSV_FIELDS) expect(typeof lookup(`gym.import.fields.${f}`)).toBe('string');
  });
});
