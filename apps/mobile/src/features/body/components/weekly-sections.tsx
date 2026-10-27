import type { AddonGuard } from '@/features/billing/model';

import { useBodyDashboard } from '../dashboard';
import { CoachCard } from './coach-card';
import { GoalCard } from './goal-card';

/** The goal with its progress bar – first in the Body tab. */
export function BodyGoal({ guard }: { guard: AddonGuard }) {
  const dash = useBodyDashboard();
  return <GoalCard guard={guard} progressPct={dash?.kpis.goalPct ?? null} />;
}

/** The weekly coach – in the Nutrition tab, since it looks at energy and food. */
export function NutritionCoach({ guard }: { guard: AddonGuard }) {
  const dash = useBodyDashboard();
  if (!dash) return null;
  return <CoachCard coach={dash.coach} model={dash.model} guard={guard} />;
}
