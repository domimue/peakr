import type { Availability, Goal, UserProfile } from '@peakr/engine';

/** Fixed sample inputs for the dev plan preview – 12 weeks, race on the last Sunday. */
export const PREVIEW_START = '2026-11-02';
export const PREVIEW_RACE = '2027-01-24';

export type PresetId = 'half' | 'tri' | 'weightloss' | 'granfondo';

export interface PlanPreset {
  profile: UserProfile;
  goal: Goal;
  availability: Availability;
  /** Race goals end on race day; non-race goals run the default 12 weeks. */
  targetDate?: string;
}

const week = (minutesPerDay: Availability['minutesPerDay'], doublesAllowed = false) => ({
  minutesPerDay,
  doublesAllowed,
});

export const PLAN_PRESETS: Record<PresetId, PlanPreset> = {
  half: {
    profile: {
      age: 34,
      experience: 'intermediate',
      sports: ['run'],
      terrain: 'rolling',
      strength: { mode: 'peakr', equipment: 'gym' },
    },
    goal: { kind: 'half' },
    availability: week([60, 60, 45, 60, 0, 120, 90]),
    targetDate: PREVIEW_RACE,
  },
  tri: {
    profile: {
      age: 41,
      experience: 'intermediate',
      sports: ['swim', 'bike', 'run'],
      terrain: 'hilly',
      poolLength: 25,
      hasPowerMeter: true,
      weakestSport: 'swim',
      strength: { mode: 'split', split: 'runners' },
    },
    goal: { kind: 'tri_70_3' },
    availability: week([60, 90, 60, 90, 45, 240, 150], true),
    targetDate: PREVIEW_RACE,
  },
  weightloss: {
    profile: {
      age: 45,
      experience: 'beginner',
      sports: ['run', 'bike'],
      terrain: 'flat',
      strength: { mode: 'peakr' },
      winterSports: ['snowshoe'],
    },
    goal: { kind: 'weightloss' },
    availability: week([45, 0, 45, 0, 45, 90, 60]),
  },
  granfondo: {
    profile: {
      age: 52,
      experience: 'advanced',
      sports: ['bike'],
      terrain: 'mountainous',
      hasPowerMeter: true,
      strength: { mode: 'split', split: 'upperLower', priority: 'balanced' },
    },
    goal: { kind: 'granfondo' },
    availability: week([60, 90, 0, 90, 60, 300, 180]),
    targetDate: PREVIEW_RACE,
  },
};
