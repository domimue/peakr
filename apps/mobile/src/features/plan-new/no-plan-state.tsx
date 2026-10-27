import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ListState } from '@/ui';

import { useArchivedPlans } from '../plan/queries';

/**
 * Today and Plan without an active plan: the quiz for a new user; "Create a new plan" for someone
 * whose plan ended (it is in the plan history, the next one starts from it).
 */
export function NoPlanState() {
  const { t } = useTranslation();
  const { data: archived } = useArchivedPlans();
  if ((archived ?? []).length > 0) {
    return (
      <ListState
        kind="empty"
        icon="trophy"
        title={t('planNew.ended.title')}
        message={t('planNew.ended.message')}
        actionLabel={t('planNew.title')}
        onAction={() => router.push('/plan-new')}
      />
    );
  }
  return (
    <ListState
      kind="empty"
      icon="calendar"
      title={t('plan.empty')}
      actionLabel={t('plan.startQuiz')}
      onAction={() => router.push('/onboarding')}
    />
  );
}
