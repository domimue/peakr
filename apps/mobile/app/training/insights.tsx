import { Redirect } from 'expo-router';

import { usePlanUiStore } from '@/features/plan/plan-ui-store';

/** Old links to Insights: training history and records live in Plan → History now. */
export default function TrainingInsightsRedirect() {
  usePlanUiStore.getState().setView('history');
  return <Redirect href="/plan" />;
}
