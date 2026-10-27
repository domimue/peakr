import { findWorkout } from '@peakr/engine';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { StoredMatchQuestion } from '@/data/repositories/activity-repository';
import { workoutTitle } from '@/features/onboarding/workout-text';
import { formatDate } from '@/features/plan/calendar';
import { usePlan } from '@/features/plan/queries';
import { Button, Card, spacing, Text } from '@/ui';

import { useAnswerQuestion, useMatchQuestions } from './queries';

/**
 * "Which session was this?" (CLAUDE.md "After import"): an activity Peakr could not match with
 * confidence. The user picks one of the plausible planned sessions or "none of these" – then it
 * counts as unplanned training and the planned session stays open. Nothing is attached by guess.
 */
export function MatchQuestionCards() {
  const { data: questions = [] } = useMatchQuestions();
  const { data: stored } = usePlan();
  if (!stored) return null;
  const mine = questions.filter((q) => q.planId === stored.id);
  return (
    <>
      {mine.map((q) => (
        <MatchQuestionCard key={q.activityKey} question={q} />
      ))}
    </>
  );
}

function MatchQuestionCard({ question: q }: { question: StoredMatchQuestion }) {
  const { t, i18n } = useTranslation();
  const { data: stored } = usePlan();
  const answer = useAnswerQuestion();
  const day = (iso: string) => formatDate(iso, i18n.language, { weekday: 'long' });
  const candidates = q.candidates.flatMap((c) => {
    const w = stored ? findWorkout(stored.state.plan, c.workoutId) : undefined;
    return w ? [w] : [];
  });
  return (
    <Card style={styles.card} testID={`match-question-${q.activityKey}`}>
      <Text variant="heading">{t('activities.question.title')}</Text>
      <Text tone="secondary">
        {t('activities.question.body', {
          sport: t(`activities.sport.${q.sport}`),
          day: day(q.date),
          minutes: Math.round(q.durationSec / 60),
          distance:
            q.distanceM && q.distanceM > 0
              ? t('activities.question.km', { km: Math.round(q.distanceM / 100) / 10 })
              : '',
          source: t(`activities.source.${q.source}`),
        })}
      </Text>
      <View style={styles.list}>
        {candidates.map((w) => (
          <Button
            key={w.id}
            variant="secondary"
            label={t('activities.question.candidate', {
              title: workoutTitle(t, w),
              day: day(w.date),
              minutes: w.durationMin,
            })}
            disabled={answer.isPending}
            onPress={() => answer.mutate({ activityKey: q.activityKey, workoutId: w.id })}
          />
        ))}
        <Button
          variant="secondary"
          label={t('activities.question.none')}
          disabled={answer.isPending}
          onPress={() => answer.mutate({ activityKey: q.activityKey, workoutId: null })}
          testID="match-question-none"
        />
      </View>
      <Text variant="caption" tone="secondary">
        {t('activities.question.noneHint')}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  list: { gap: spacing.xs },
});
