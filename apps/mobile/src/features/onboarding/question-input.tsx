import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { formatDuration } from '@peakr/engine';
import type { QuizAnswers, QuizAnswerValue, QuizIssue, QuizQuestion } from '@peakr/quiz';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import {
  Button,
  CheckList,
  CheckRow,
  ChoiceList,
  DurationField,
  spacing,
  Stepper,
  Text,
  TextField,
  useTheme,
  type DurationParts,
} from '@/ui';

/** Number questions with a small range get − / + buttons, others a numeric field. */
const STEPPER_MAX_SPAN = 30;

export interface QuestionInputProps {
  question: QuizQuestion;
  answers: QuizAnswers;
  /** Issues of this question; only shown once it has a value (no "required" on a fresh screen). */
  issues: readonly QuizIssue[];
  onAnswer: (value: QuizAnswerValue) => void;
  onClear: () => void;
}

/** Renders any shared quiz question (web renders the same definitions with its own widgets). */
export function QuestionInput({
  question,
  answers,
  issues,
  onAnswer,
  onClear,
}: QuestionInputProps) {
  const { t } = useTranslation();
  const title = t(question.titleKey as never) as string;
  const hint = question.hintKey ? (t(question.hintKey as never) as string) : undefined;
  const value = answers[question.id];
  const issue = value === undefined ? undefined : issues[0];
  const error = issue ? issueMessage(t, question, issue) : undefined;

  // Text-like questions render as a labelled field; choices get a heading above.
  const field =
    question.kind === 'number' || question.kind === 'duration' || question.kind === 'text';

  return (
    <View style={styles.question}>
      {field ? null : (
        <>
          <Text variant="heading" accessibilityRole="header">
            {title}
          </Text>
          {hint ? <Text tone="secondary">{hint}</Text> : null}
        </>
      )}
      <Input
        question={question}
        title={title}
        hint={field ? hint : undefined}
        value={value}
        error={error}
        onAnswer={onAnswer}
        onClear={onClear}
        answers={answers}
      />
      {error && !field ? <ErrorText text={error} /> : null}
    </View>
  );
}

interface InputProps {
  question: QuizQuestion;
  answers: QuizAnswers;
  title: string;
  hint?: string;
  value: QuizAnswerValue | undefined;
  error: string | undefined;
  onAnswer: (value: QuizAnswerValue) => void;
  onClear: () => void;
}

function Input(props: InputProps) {
  const { t } = useTranslation();
  const { question: q, title, value, onAnswer } = props;
  const label = (key: string) => t(key as never) as string;

  switch (q.kind) {
    case 'single':
      return (
        <ChoiceList
          label={title}
          value={value as string | undefined}
          onChange={onAnswer}
          choices={q.options.map((o) => ({
            value: o.value,
            label: label(o.labelKey),
            description: o.descriptionKey ? label(o.descriptionKey) : undefined,
          }))}
        />
      );
    case 'multi': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <CheckList
          label={title}
          selected={selected}
          onToggle={(v) =>
            onAnswer(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v])
          }
          choices={q.options.map((o) => ({
            value: o.value,
            label: label(o.labelKey),
            description: o.descriptionKey ? label(o.descriptionKey) : undefined,
          }))}
        />
      );
    }
    case 'number': {
      const range = q.range(props.answers);
      return range.max - range.min <= STEPPER_MAX_SPAN ? (
        <View style={styles.question}>
          <Stepper
            label={title}
            value={typeof value === 'number' ? value : range.min}
            min={range.min}
            max={range.max}
            onChange={onAnswer}
            format={(n) =>
              q.unitKey ? (t(q.unitKey as never, { count: n }) as string) : String(n)
            }
            decreaseLabel={t('common.decrease')}
            increaseLabel={t('common.increase')}
          />
          {props.hint ? (
            <Text variant="caption" tone="secondary">
              {props.hint}
            </Text>
          ) : null}
          {props.error ? <ErrorText text={props.error} /> : null}
        </View>
      ) : (
        <NumberInput {...props} />
      );
    }
    case 'duration':
      return <DurationInput {...props} />;
    case 'weekMinutes':
      return <WeekMinutesInput {...props} />;
    case 'date':
      return <DateInput {...props} />;
    case 'text':
      return (
        <TextField
          label={title}
          hint={props.hint}
          value={typeof value === 'string' ? value : ''}
          onChangeText={(text) => (text === '' ? props.onClear() : onAnswer(text))}
          maxLength={q.maxLength}
          multiline
          error={props.error}
        />
      );
    case 'confirm':
      return (
        <CheckRow
          label={label(q.labelKey)}
          checked={value === true}
          onChange={(c) => onAnswer(c)}
        />
      );
  }
}

function NumberInput({ question, title, hint, value, error, onAnswer, onClear }: InputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(typeof value === 'number' ? String(value) : '');
  const unit =
    question.kind === 'number' && question.unitKey
      ? (t(question.unitKey as never) as string)
      : undefined;
  return (
    <TextField
      label={title}
      hint={hint}
      value={text}
      keyboardType="number-pad"
      maxLength={4}
      suffix={unit}
      error={error}
      onChangeText={(raw) => {
        const digits = raw.replace(/\D/g, '');
        setText(digits);
        if (digits === '') onClear();
        else onAnswer(Number(digits));
      }}
    />
  );
}

function toParts(seconds: number | undefined, withHours: boolean): DurationParts {
  if (seconds === undefined) return { h: '', m: '', s: '' };
  const h = withHours ? Math.floor(seconds / 3600) : 0;
  const m = Math.floor((seconds - h * 3600) / 60);
  const s = seconds % 60;
  return { h: h > 0 ? String(h) : '', m: String(m), s: String(s).padStart(2, '0') };
}

function DurationInput({ question, title, hint, value, error, onAnswer, onClear }: InputProps) {
  const { t } = useTranslation();
  const withHours = question.kind === 'duration' && Boolean(question.withHours);
  const [parts, setParts] = useState(() =>
    toParts(typeof value === 'number' ? value : undefined, withHours),
  );
  const [partsInvalid, setPartsInvalid] = useState(false);
  const unit =
    question.kind === 'duration' && question.unitKey
      ? (t(question.unitKey as never) as string)
      : undefined;

  const change = (next: DurationParts) => {
    setParts(next);
    if (next.h === '' && next.m === '' && next.s === '') {
      setPartsInvalid(false);
      onClear();
      return;
    }
    const [h, m, s] = [Number(next.h || 0), Number(next.m || 0), Number(next.s || 0)];
    const invalid = s >= 60 || (withHours && m >= 60);
    setPartsInvalid(invalid);
    if (invalid) onClear();
    else onAnswer(h * 3600 + m * 60 + s);
  };

  return (
    <DurationField
      label={unit ? `${title} (${unit})` : title}
      hint={hint}
      value={parts}
      onChange={change}
      showHours={withHours}
      unitLabels={{ h: t('units.h'), m: t('units.min'), s: t('units.s') }}
      accessibilityLabels={{ h: t('units.hours'), m: t('units.minutes'), s: t('units.seconds') }}
      error={partsInvalid ? t('validation.invalidDuration') : error}
    />
  );
}

function WeekMinutesInput({ question, value, onAnswer }: InputProps) {
  const { t } = useTranslation();
  if (question.kind !== 'weekMinutes') return null;
  const minutes = Array.isArray(value) ? (value as number[]) : [0, 0, 0, 0, 0, 0, 0];
  const total = minutes.reduce((sum, m) => sum + m, 0);
  const { min, max, step } = question.range;
  return (
    <View style={styles.week}>
      <View style={styles.week}>
        {minutes.map((m, day) => (
          <Stepper
            key={day}
            label={t(`quiz.availability.weekdays.${day}` as never) as string}
            value={m}
            min={min}
            max={max}
            step={step}
            onChange={(next) => onAnswer(minutes.map((x, i) => (i === day ? next : x)))}
            format={(n) =>
              n === 0 ? t('quiz.availability.rest') : t('quiz.availability.minutes', { count: n })
            }
            decreaseLabel={t('common.decrease')}
            increaseLabel={t('common.increase')}
          />
        ))}
      </View>
      <Text variant="caption" tone="secondary">
        {t('quiz.availability.total', { hours: Math.round(total / 6) / 10 })}
      </Text>
    </View>
  );
}

/** Local ISO date ↔ Date at local midnight. */
const fromIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};
const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

function DateInput({ question, value, onAnswer, onClear }: InputProps) {
  const { t, i18n } = useTranslation();
  // Android shows the picker as a dialog; iOS and web render it in place.
  const [open, setOpen] = useState(false);
  if (question.kind !== 'date') return null;
  const today = new Date();
  const min = addDays(today, question.rangeDays.min);
  const max = addDays(today, question.rangeDays.max);
  const selected = typeof value === 'string' ? fromIso(value) : undefined;
  const picker = (
    <DateTimePicker
      value={selected ?? min}
      mode="date"
      minimumDate={min}
      maximumDate={max}
      onValueChange={(_e, date) => {
        setOpen(false);
        onAnswer(toIso(date));
      }}
      onDismiss={() => setOpen(false)}
    />
  );
  const formatted = selected
    ? selected.toLocaleDateString(i18n.language, { dateStyle: 'long' })
    : undefined;

  return (
    <View style={styles.week}>
      {Platform.OS === 'android' ? (
        <>
          <Button
            variant="secondary"
            label={formatted ?? t('quiz.targetDate.pick')}
            accessibilityHint={t('quiz.targetDate.pick')}
            onPress={() => setOpen(true)}
          />
          {open ? picker : null}
        </>
      ) : (
        <>
          {picker}
          {formatted ? <Text tone="secondary">{formatted}</Text> : null}
        </>
      )}
      {question.optional && selected ? (
        <Button small variant="secondary" label={t('quiz.targetDate.clear')} onPress={onClear} />
      ) : null}
      {question.optional && !selected ? (
        <Text variant="caption" tone="secondary">
          {t('quiz.targetDate.none')}
        </Text>
      ) : null}
    </View>
  );
}

function ErrorText({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text variant="caption" style={{ color: colors.danger }} accessibilityLiveRegion="polite">
      {text}
    </Text>
  );
}

/** Translated message for a quiz issue; times and dates get readable params. */
export function issueMessage(t: TFunction, q: QuizQuestion, issue: QuizIssue): string {
  const params = issue.params ?? {};
  if (issue.code === 'outOfRange' && q.kind === 'duration') {
    return t('validation.outOfRange', {
      min: formatDuration(params.min ?? 0),
      max: formatDuration(params.max ?? 0),
    });
  }
  if (issue.code === 'outOfRange' && q.kind === 'date') {
    return t('validation.dateOutOfRange', {
      min: Math.round((params.min ?? 0) / 7),
      max: Math.round((params.max ?? 0) / 7),
    });
  }
  return t(`validation.${issue.code}` as never, params) as string;
}

const styles = StyleSheet.create({
  question: { gap: spacing.sm },
  week: { gap: spacing.xs },
});
