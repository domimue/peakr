import type { HrZone, Target, Workout } from '@peakr/engine';
import * as shared from '@peakr/quiz';
import type { TFunction } from 'i18next';

/**
 * Readable texts for a planned workout (forecast week 1, workout screen). The texts are shared
 * with the website (`@peakr/quiz`); this adapts the app's typed `t` to them.
 */

const tr =
  (t: TFunction): shared.Translate =>
  (key, params) =>
    String(t(key as never, params as never));

export const zoneNumber = shared.zoneNumber;

export const workoutTitle = (t: TFunction, w: Workout) => shared.workoutTitle(tr(t), w);

export const durationText = (t: TFunction, w: Pick<Workout, 'duration'>) =>
  shared.durationText(tr(t), w);

export const targetText = (t: TFunction, target: Target, hrZones: readonly HrZone[] = []) =>
  shared.targetText(tr(t), target, hrZones);

export const structureLines = (t: TFunction, w: Workout) => shared.structureLines(tr(t), w);

export const exerciseLines = (t: TFunction, w: Workout) => shared.exerciseLines(tr(t), w);
