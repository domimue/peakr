import { CORE_FIGURES } from './poses-core';
import { LEG_FIGURES } from './poses-legs';
import { PULL_FIGURES } from './poses-pull';
import { PUSH_FIGURES } from './poses-push';
import type { FigureDef } from './render';

/**
 * Pose and equipment per library exercise (CLAUDE.md "Gym", docs/gym-illustrations.md). Side views
 * face right; front views are used where the movement happens sideways (raises, flys, abduction).
 */
export const FIGURES: Readonly<Record<string, FigureDef>> = {
  ...LEG_FIGURES,
  ...PUSH_FIGURES,
  ...PULL_FIGURES,
  ...CORE_FIGURES,
};
