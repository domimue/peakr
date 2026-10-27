import {
  prepareAnswers,
  stepInsight,
  stepIssues,
  stepQuestions,
  visibleSteps,
  type QuizInsight,
} from '@peakr/quiz';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authAvailable } from '@/features/auth/session-store';
import { useBaselineStore } from '@/features/baseline/baseline-store';
import { BaselineStep } from '@/features/baseline/screens/baseline-step';
import { useNewPlanFlow } from '@/features/plan-new/flow-store';
import { Button, Card, fontSizes, ProgressBar, radius, spacing, Text, useTheme } from '@/ui';

import { QuestionInput } from '../question-input';
import { localToday, useQuizStore } from '../quiz-store';

/**
 * The onboarding quiz: one step per screen with an animated progress bar, an insight card between
 * steps where there is something personal to say, and answers saved on every change.
 */
export function QuizScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const today = useMemo(() => localToday(), []);
  const {
    hydrated,
    hydrate,
    answers: given,
    stepId,
    insight: showingInsight,
    direction,
  } = useQuizStore();
  const { answer, clear, goTo, finish } = useQuizStore.getState();
  const baselineUsed = useBaselineStore((s) => s.meta !== null && s.activities.length > 0);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const answers = useMemo(() => prepareAnswers(given, today), [given, today]);
  // The Strava calibration step needs Supabase (an anonymous user holds the connection).
  const steps = visibleSteps(answers, { baseline: authAvailable });
  const found = steps.findIndex((s) => s.id === stepId);
  const index = found < 0 ? 0 : found;
  const step = steps[index];
  const insight: QuizInsight | null = step ? stepInsight(step, answers, today) : null;
  const onInsight = showingInsight && insight !== null;

  const back = () => {
    if (!step) return;
    const previous = steps[index - 1];
    if (onInsight) goTo(step.id, false, -1);
    else if (previous) goTo(previous.id, false, -1);
    else router.back();
  };

  // Android back button steps back inside the quiz instead of leaving it.
  const backRef = useRef(back);
  useEffect(() => {
    backRef.current = back;
  });
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        backRef.current();
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  if (!hydrated || !step) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} />;

  const questions = stepQuestions(step, answers);
  const issues = stepIssues(step, answers, today);
  const isLast = index === steps.length - 1;
  const baselineStep = step.kind === 'baseline';

  const next = () => {
    if (!onInsight && insight) return goTo(step.id, true, 1);
    const following = steps[index + 1];
    if (following) return goTo(following.id, false, 1);
    finish();
    // Which watch the user wears (skippable) comes before the forecast – a new plan in the same
    // account already knows it.
    router.push(useNewPlanFlow.getState().active ? '/onboarding/forecast' : '/onboarding/watch');
  };

  const progress = (index + (onInsight ? 1 : 0.35)) / steps.length;
  const entering = (direction > 0 ? FadeInRight : FadeInLeft).duration(250);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quiz.back')}
          onPress={back}
          hitSlop={12}
          style={styles.backButton}
        >
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <ProgressBar
          progress={progress}
          accessibilityLabel={t('quiz.progress', { current: index + 1, total: steps.length })}
        />
        <Text variant="caption" tone="secondary" style={styles.counter}>
          {`${index + 1}/${steps.length}`}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Animated.View
          key={`${step.id}-${onInsight ? 'insight' : 'questions'}`}
          entering={entering}
          style={styles.step}
        >
          {onInsight && insight ? (
            <InsightCard insight={insight} />
          ) : baselineStep ? (
            <BaselineStep />
          ) : (
            questions.map((q) => (
              <QuestionInput
                key={q.id}
                question={q}
                answers={answers}
                issues={issues.filter((i) => i.questionId === q.id)}
                onAnswer={(v) => answer(q.id, v)}
                onClear={() => clear(q.id)}
              />
            ))
          )}
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Button
          label={
            onInsight
              ? t('quiz.continue')
              : baselineStep && !baselineUsed
                ? t('baseline.step.skip')
                : isLast && !insight
                  ? t('quiz.seeForecast')
                  : t('quiz.next')
          }
          // Skipping the calibration is a plain choice, not the screen's main action.
          variant={baselineStep && !baselineUsed ? 'secondary' : 'primary'}
          disabled={!onInsight && issues.length > 0}
          onPress={next}
        />
      </View>
    </SafeAreaView>
  );
}

function InsightCard({ insight }: { insight: QuizInsight }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card>
      <View style={[styles.badge, { backgroundColor: colors.surface2 }]}>
        <Text variant="caption" style={{ color: colors.accentLine, fontWeight: '700' }}>
          {t('quiz.insights.title')}
        </Text>
      </View>
      <Text variant="heading" accessibilityRole="header">
        {t(insight.key as never, { ...insight.params }) as string}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: fontSizes.xxl, lineHeight: 32, fontWeight: '300' },
  counter: { minWidth: 36, textAlign: 'right' },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  step: { gap: spacing.lg },
  footer: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
});
