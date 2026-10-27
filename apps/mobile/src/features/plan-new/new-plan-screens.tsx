import {
  formatDuration,
  generatePlan,
  planOutcome,
  type PlanReview,
  type ReviewAnswers,
  type ReviewChanges,
  type ReviewWish,
} from '@peakr/engine';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import { useBaselineStore } from '@/features/baseline/baseline-store';
import { localToday, useQuizStore } from '@/features/onboarding/quiz-store';
import { Button, Card, ChipGroup, ListState, numeric, Screen, spacing, Text } from '@/ui';

import { formatDate } from '../plan/calendar';
import { typeName } from '../plan/kind';
import { useCreatePlan, usePlan } from '../plan/queries';
import { goalName } from '../plan-history/badges';
import { newPlanInput } from './calibrate';
import { usePreviousPlan } from './previous';
import { usePlanReview } from './review';
import { saveArchiveReview } from '@/data/repositories/plan-repository';
import { useNewPlanFlow } from './flow-store';
import { startNewPlan } from './start';

type Choice<K extends keyof ReviewAnswers> = NonNullable<ReviewAnswers[K]>;

const QUESTIONS = {
  overall: ['tooEasy', 'right', 'tooHard'],
  long: ['good', 'tooLong', 'tooShort'],
  quality: ['tooLittle', 'right', 'tooMuch'],
  time: ['tooMuch', 'right', 'tooLittle'],
} as const satisfies { [K in 'overall' | 'long' | 'quality' | 'time']: readonly Choice<K>[] };
const WISHES: readonly ReviewWish[] = ['moreIntervals', 'moreVolume', 'moreStrength', 'fewerDays'];

/**
 * Start of "Create a new plan" (Profile): "How was your last plan?" – what the plan measured, a
 * few optional taps, and what that changes, each with its reason – then the quiz with the earlier
 * answers (current training included), the forecast and the confirmation.
 */
export function NewPlanStartScreen() {
  const { t } = useTranslation();
  const { previous, isPending } = usePreviousPlan();
  const review = usePlanReview();
  const flow = useNewPlanFlow();
  if (isPending) return <ListState kind="loading" label={t('common.loading')} />;

  const go = async (skip: boolean) => {
    if (skip) flow.skipReview();
    await startNewPlan(previous);
    router.push('/onboarding/quiz');
  };

  return (
    <Screen title={t('planNew.title')}>
      <Text tone="secondary">{t('planNew.intro')}</Text>
      {previous && review ? (
        <>
          <Measured measured={review.measured} goal={previous.state.plan.goal.kind} />
          <Text variant="heading">{t('planReview.ask')}</Text>
          {(Object.keys(QUESTIONS) as (keyof typeof QUESTIONS)[]).map((q) => (
            <ChipGroup
              key={q}
              label={t(`planReview.questions.${q}.label`)}
              options={QUESTIONS[q].map((v) => ({
                value: v,
                label: t(`planReview.questions.${q}.${v}` as never) as string,
              }))}
              selected={flow.review[q] ? [flow.review[q] as string] : []}
              onToggle={(v) => flow.answer({ [q]: flow.review[q] === v ? undefined : v })}
            />
          ))}
          <ChipGroup
            label={t('planReview.questions.complaints.label')}
            options={(['yes', 'no'] as const).map((v) => ({
              value: v,
              label: t(`planReview.questions.complaints.${v}`),
            }))}
            selected={
              flow.review.breakForComplaints === undefined
                ? []
                : [flow.review.breakForComplaints ? 'yes' : 'no']
            }
            onToggle={(v) => flow.answer({ breakForComplaints: v === 'yes' })}
          />
          <ChipGroup
            label={t('planReview.questions.wishes.label')}
            multiple
            options={WISHES.map((v) => ({
              value: v,
              label: t(`planReview.questions.wishes.${v}`),
            }))}
            selected={flow.review.wishes ?? []}
            onToggle={(v) => {
              const wishes = new Set(flow.review.wishes ?? []);
              if (wishes.has(v)) wishes.delete(v);
              else wishes.add(v);
              flow.answer({ wishes: [...wishes] });
            }}
          />
          <Changes changes={review.changes} />
          <Text variant="caption" tone="secondary">
            {t('planNew.archived')}
          </Text>
        </>
      ) : null}
      <Button label={t('planNew.start')} onPress={() => void go(false)} testID="new-plan-start" />
      {previous ? (
        <Button
          variant="secondary"
          label={t('planReview.skip')}
          onPress={() => void go(true)}
          testID="new-plan-skip-review"
        />
      ) : null}
    </Screen>
  );
}

function Measured({ measured, goal }: { measured: PlanReview; goal: string }) {
  const { t } = useTranslation();
  const { summary } = measured;
  const pace = (s: number) => t('progress.pace', { pace: formatDuration(s) });
  return (
    <Card testID="review-measured">
      <Text variant="label">{t('planNew.current', { goal: goalName(t, goal) })}</Text>
      <Text style={numeric}>
        {t('planHistory.sessions', {
          done: summary.sessionsDone,
          planned: summary.sessionsPlanned,
          percent: Math.round(summary.completion * 100),
        })}
      </Text>
      {(['long', 'quality', 'easy', 'strength'] as const)
        .filter((g) => summary.byGroup[g].planned > 0)
        .map((g) => (
          <Text key={g} tone="secondary" style={numeric}>
            {`${t(`planHistory.groups.${g}`)}: ${t('planHistory.groupLine', { ...summary.byGroup[g] })}`}
          </Text>
        ))}
      {measured.mostSkipped.length > 0 ? (
        <Text tone="secondary">
          {t('planReview.measured.skipped', {
            list: measured.mostSkipped
              .map((s) => `${typeName(t, s.type)} (${s.count}×)`)
              .join(', '),
          })}
        </Text>
      ) : null}
      {measured.missedWeeks > 0 ? (
        <Text tone="secondary">
          {t('planReview.measured.missedWeeks', { count: measured.missedWeeks })}
        </Text>
      ) : null}
      {measured.qualityDowngraded > 0 ? (
        <Text tone="secondary">
          {t('planReview.measured.downgraded', { count: measured.qualityDowngraded })}
        </Text>
      ) : null}
      <Text tone="secondary">
        {measured.easyPace
          ? t('planReview.measured.easyPace', {
              first: pace(measured.easyPace.first),
              last: pace(measured.easyPace.last),
            })
          : t('planReview.measured.easyPaceNone')}
      </Text>
      <Text tone="secondary">
        {measured.longEasyShare !== null
          ? t('planReview.measured.longEasy', { percent: Math.round(measured.longEasyShare * 100) })
          : t('planReview.measured.longEasyNone')}
      </Text>
    </Card>
  );
}

function Changes({ changes }: { changes: ReviewChanges }) {
  const { t } = useTranslation();
  const flow = useNewPlanFlow();
  if (changes.lines.length === 0) return null;
  return (
    <Card testID="review-changes">
      <Text variant="label">{t('planReview.changesTitle')}</Text>
      {changes.lines.map((l) => (
        <Text
          key={l.key}
        >{`•  ${t(`planReview.lines.${l.key}` as never, { ...l.params }) as string}`}</Text>
      ))}
      {changes.difficulty !== null ? (
        <ChipGroup
          label={t('planReview.difficultyChoice')}
          options={[
            { value: 'take', label: t('planReview.difficultyTake', { to: changes.difficulty }) },
            { value: 'keep', label: t('planReview.difficultyKeep') },
          ]}
          selected={[flow.acceptDifficulty ? 'take' : 'keep']}
          onToggle={(v) => flow.setAcceptDifficulty(v === 'take')}
        />
      ) : null}
      {changes.returnAfterBreak ? (
        <Text variant="caption" tone="secondary">
          {t('planReview.doctor')}
        </Text>
      ) : null}
    </Card>
  );
}

/**
 * The last step: start date, what is archived, what stays and what goes. Nothing changes before
 * "Start my new plan"; a plan below what the user already does is not built (the reason is shown).
 */
export function NewPlanConfirmScreen() {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => localToday(), []);
  const { data: current } = usePlan();
  const { previous, isPending } = usePreviousPlan();
  const answers = useQuizStore((s) => s.answers);
  const baseline = useBaselineStore();
  const create = useCreatePlan();
  const flow = useNewPlanFlow();
  const review = usePlanReview();

  const built = useMemo(() => {
    const input = newPlanInput(
      answers,
      baseline,
      previous,
      today,
      review ? { changes: review.changes, acceptDifficulty: flow.acceptDifficulty } : undefined,
    );
    if (!input) return null;
    const plan = generatePlan(
      input.profile,
      input.goal,
      input.availability,
      input.startDate,
      input.targetDate,
    );
    return { input, plan };
  }, [answers, baseline, previous, today, review, flow.acceptDifficulty]);

  // The new plan starts from the previous one – nothing is built before it has loaded.
  if (isPending) return <ListState kind="loading" label={t('common.loading')} />;
  if (!built) {
    return (
      <Screen title={t('planNew.confirm.title')}>
        <Text>{t('quiz.forecast.error')}</Text>
        <Button
          label={t('quiz.forecast.editAnswers')}
          onPress={() => router.replace('/onboarding/quiz')}
        />
      </Screen>
    );
  }
  const { input, plan } = built;
  const date = (iso: string) => formatDate(iso, i18n.language, { dateStyle: 'full' });
  const outcome = current
    ? planOutcome(current.state, current.input.profile, todayIso()).outcome
    : null;

  const confirm = () => {
    const { profile, goal, availability, startDate, targetDate, hrZones, stravaHrZones } = input;
    create.mutate(
      {
        profile,
        goal,
        availability,
        startDate,
        hrZones,
        ...(targetDate ? { targetDate } : {}),
        ...(stravaHrZones ? { stravaHrZones } : {}),
        // Manual zones from Profile → Training zones stay.
        ...(previous?.input.zones ? { zones: previous.input.zones } : {}),
      },
      {
        onSuccess: async () => {
          // The answers stay with the archived plan (Plan history, the next review).
          if (previous && review && Object.keys(flow.review).length > 0) {
            await saveArchiveReview(previous.id, {
              answers: flow.review,
              acceptDifficulty: flow.acceptDifficulty,
              lines: review.changes.lines,
            }).catch((e: unknown) => console.warn('Saving the review failed', e));
          }
          flow.end();
          router.replace('/today');
        },
      },
    );
  };

  return (
    <Screen title={t('planNew.confirm.title')}>
      <Card testID="new-plan-summary">
        <Text variant="label">{goalName(t, input.goal.kind)}</Text>
        <Text>{t('planNew.confirm.starts', { date: date(input.startDate) })}</Text>
      </Card>
      {current && outcome ? (
        <Card>
          <Text variant="label">
            {t('planNew.confirm.archive', { goal: goalName(t, current.state.plan.goal.kind) })}
          </Text>
          <Text tone="secondary">{t(`planNew.confirm.outcome.${outcome}`)}</Text>
        </Card>
      ) : null}
      <View style={styles.list}>
        <Text variant="label">{t('planNew.confirm.staysTitle')}</Text>
        {(['sessions', 'activities', 'gym', 'body'] as const).map((k) => (
          <Text key={k}>{`•  ${t(`planNew.confirm.stays.${k}`)}`}</Text>
        ))}
      </View>
      <View style={styles.list}>
        <Text variant="label">{t('planNew.confirm.goesTitle')}</Text>
        {(['planned', 'changes', 'weeks'] as const).map((k) => (
          <Text key={k}>{`•  ${t(`planNew.confirm.goes.${k}`)}`}</Text>
        ))}
      </View>
      <Text variant="caption" tone="secondary">
        {t('planNew.confirm.undo')}
      </Text>
      {plan.ok ? (
        <Button
          label={t('planNew.confirm.action')}
          disabled={create.isPending}
          onPress={confirm}
          testID="new-plan-confirm"
        />
      ) : (
        <>
          <Text tone="danger" testID="new-plan-error">
            {plan.issues[0]
              ? t(`validation.${plan.issues[0].code}`, plan.issues[0].params ?? {})
              : t('quiz.forecast.error')}
          </Text>
          <Button
            label={t('quiz.forecast.editAnswers')}
            onPress={() => router.replace('/onboarding/quiz')}
          />
        </>
      )}
      {create.isError ? <Text tone="danger">{t('planNew.confirm.failed')}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs },
});
