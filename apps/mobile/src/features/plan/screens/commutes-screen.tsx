import type { Commute } from '@peakr/engine';
import {
  commuteOf,
  onboardingQuestions,
  prepareAnswers,
  QUESTION_IDS,
  setAnswer,
  validateAnswers,
  visibleQuestions,
  type QuizAnswers,
  type QuizQuestion,
} from '@peakr/quiz';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { newId, todayIso } from '@/data/ids';
import { Button, Card, Icon, Screen, spacing, Text, useTheme } from '@/ui';

import { QuestionInput } from '../../onboarding/question-input';
import { addDays, formatDate } from '../calendar';
import { usePlan, usePlanActions } from '../queries';
import { issueText } from '../issue-text';

const Q = QUESTION_IDS;
const IDS: readonly string[] = [Q.commuteSport, Q.commuteMinutes, Q.commuteDays, Q.commuteBothWays];
/** The quiz's commute questions; here a commute always has a sport ("No" is the empty list). */
const QUESTIONS: QuizQuestion[] = onboardingQuestions
  .filter((q) => IDS.includes(q.id))
  .map((q) =>
    q.kind === 'single' && q.id === Q.commuteSport
      ? { ...q, options: q.options.filter((o) => o.value !== 'none'), defaultValue: () => 'bike' }
      : q,
  );
/** A Monday, for weekday names. */
const MONDAY = '2026-10-19';

export function commuteSummary(t: TFunction, language: string, c: Commute): string {
  return t('plan.commutes.summary', {
    sport: t(`quiz.commute.sport.options.${c.sport}.label`),
    minutes: c.oneWayMin,
    ways: t(c.bothWays ? 'plan.commutes.bothWays' : 'plan.commutes.oneWay'),
    days: [...c.weekdays]
      .sort((a, b) => a - b)
      .map((d) => formatDate(addDays(MONDAY, d), language, { weekday: 'short' }))
      .join(', '),
  });
}

function answersOf(c: Commute | null): QuizAnswers {
  if (!c) return {};
  return {
    [Q.commuteSport]: c.sport,
    [Q.commuteMinutes]: c.oneWayMin,
    [Q.commuteDays]: c.weekdays.map(String),
    [Q.commuteBothWays]: c.bothWays ? 'yes' : 'no',
  };
}

/**
 * Commutes (CLAUDE.md "Commuting"): the user's regular trips by bike, running or walking. Saving
 * rebuilds the remaining weeks; commutes are planned first as easy sessions.
 */
export function CommutesScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { data: stored } = usePlan();
  const actions = usePlanActions();
  const [editing, setEditing] = useState<Commute | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!stored) return <Screen />;
  const { profile } = stored.input;
  const commutes = profile.commutes ?? [];

  const save = (list: Commute[]) => {
    const result = actions.updateProfile({ ...profile, commutes: list });
    if (!result.ok) {
      setError(issueText(t, result.issues));
      return;
    }
    setError(null);
    setEditing(null);
  };

  if (editing !== null) {
    const current = editing === 'new' ? null : editing;
    return (
      <CommuteForm
        key={current?.id ?? 'new'}
        commute={current}
        error={error}
        onSave={(c) =>
          save(current ? commutes.map((x) => (x.id === current.id ? c : x)) : [...commutes, c])
        }
        onRemove={current ? () => save(commutes.filter((x) => x.id !== current.id)) : undefined}
      />
    );
  }

  return (
    <Screen>
      <Text tone="secondary">{t('plan.commutes.hint')}</Text>
      {commutes.length === 0 ? <Text>{t('plan.commutes.empty')}</Text> : null}
      {commutes.map((c) => (
        <Card key={c.id}>
          <View style={styles.row}>
            <Icon name="commute" color={colors.sportCommute} />
            <Text style={styles.flex}>{commuteSummary(t, i18n.language, c)}</Text>
          </View>
          <Button
            small
            variant="secondary"
            label={t('plan.commutes.edit')}
            onPress={() => setEditing(c)}
          />
        </Card>
      ))}
      {error ? <Text style={{ color: colors.errorText }}>{error}</Text> : null}
      <Button icon="commute" label={t('plan.commutes.add')} onPress={() => setEditing('new')} />
    </Screen>
  );
}

function CommuteForm({
  commute,
  error,
  onSave,
  onRemove,
}: {
  commute: Commute | null;
  error: string | null;
  onSave: (c: Commute) => void;
  onRemove: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const today = todayIso();
  const [answers, setAnswers] = useState<QuizAnswers>(() =>
    prepareAnswers({ ...answersOf(commute), [Q.commuteSport]: commute?.sport ?? 'bike' }, today),
  );
  const questions = visibleQuestions(QUESTIONS, answers);
  const issues = validateAnswers(questions, answers);
  const result = issues.length === 0 ? commuteOf(answers) : undefined;

  return (
    <Screen>
      {questions.map((q) => (
        <QuestionInput
          key={q.id}
          question={q}
          answers={answers}
          issues={issues.filter((i) => i.questionId === q.id)}
          onAnswer={(value) => setAnswers((a) => setAnswer(a, q.id, value))}
          onClear={() => undefined}
        />
      ))}
      {error ? <Text style={{ color: colors.errorText }}>{error}</Text> : null}
      <Button
        label={t('plan.commutes.save')}
        disabled={!result}
        onPress={() => result && onSave({ ...result, id: commute?.id ?? newId() })}
      />
      {onRemove ? (
        <Button variant="secondary" label={t('plan.commutes.remove')} onPress={onRemove} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
