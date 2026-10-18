import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, spacing, Text } from '@/ui';

import { useSaveStrengthSetup } from '../queries';
import { QuestionView, setupFromAnswers, useStrengthAnswers } from '../setup-form';

/** Onboarding step: the shared strength questions, one per screen. */
export function StrengthOnboardingScreen() {
  const { t } = useTranslation();
  const save = useSaveStrengthSetup();
  const { answers, questions, issues, answer } = useStrengthAnswers({});
  const [index, setIndex] = useState(0);

  const current = questions[Math.min(index, questions.length - 1)];
  if (!current) return <Screen />;
  const isLast = index >= questions.length - 1;
  const answered = !issues.some((i) => i.questionId === current.id);

  const finish = () => {
    const setup = setupFromAnswers(answers);
    save.mutate(setup, {
      onSuccess: () =>
        router.replace(setup.mode === 'routines' ? '/strength/routines/new' : '/plan'),
    });
  };

  return (
    <Screen title={t('quiz.strength.stepTitle')}>
      <Text variant="caption" tone="secondary">
        {t('quiz.progress', { current: index + 1, total: questions.length })}
      </Text>
      <QuestionView question={current} answers={answers} onAnswer={(v) => answer(current.id, v)} />
      <View style={styles.actions}>
        {index > 0 ? (
          <View style={styles.action}>
            <Button
              variant="secondary"
              label={t('quiz.back')}
              onPress={() => setIndex(index - 1)}
            />
          </View>
        ) : null}
        <View style={styles.action}>
          <Button
            label={isLast ? t('quiz.finish') : t('quiz.next')}
            disabled={!answered || save.isPending}
            onPress={isLast ? finish : () => setIndex(index + 1)}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});
