'use client';

import { formatDuration } from '@peakr/engine';
import type { QuizAnswers, QuizAnswerValue, QuizIssue, QuizQuestion, Translate } from '@peakr/quiz';
import { useId, useState } from 'react';

import { textInput } from '@/components/ui';
import { t } from '@/i18n/plan';

/** Number questions with a small range get − / + buttons, others a numeric field (as in the app). */
const STEPPER_MAX_SPAN = 30;

export interface QuestionInputProps {
  question: QuizQuestion;
  answers: QuizAnswers;
  /** Issues of this question; only shown once it has a value (no "required" on a fresh screen). */
  issues: readonly QuizIssue[];
  onAnswer: (value: QuizAnswerValue) => void;
  onClear: () => void;
}

/** Translated message for a quiz issue; times and dates get readable params (same as the app). */
export function issueMessage(tr: Translate, q: QuizQuestion, issue: QuizIssue): string {
  const params = issue.params ?? {};
  if (issue.code === 'outOfRange' && q.kind === 'duration') {
    return tr('validation.outOfRange', {
      min: formatDuration(params.min ?? 0),
      max: formatDuration(params.max ?? 0),
    });
  }
  if (issue.code === 'outOfRange' && q.kind === 'date') {
    return tr('validation.dateOutOfRange', {
      min: Math.round((params.min ?? 0) / 7),
      max: Math.round((params.max ?? 0) / 7),
    });
  }
  return tr(`validation.${issue.code}`, params);
}

/** Renders any shared quiz question – the same definitions the app renders with its widgets. */
export function QuestionInput({
  question,
  answers,
  issues,
  onAnswer,
  onClear,
}: QuestionInputProps) {
  const id = useId();
  const title = t(question.titleKey);
  const hint = question.hintKey ? t(question.hintKey) : undefined;
  const value = answers[question.id];
  const issue = value === undefined ? undefined : issues[0];
  const error = issue ? issueMessage(t, question, issue) : undefined;
  const ids = { title: `${id}-title`, hint: `${id}-hint`, error: `${id}-error` };
  const describedBy = [hint ? ids.hint : null, error ? ids.error : null].filter(Boolean).join(' ');
  const field = { ids, title, describedBy: describedBy || undefined, error: error !== undefined };

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" aria-describedby={field.describedBy}>
      <legend id={ids.title} className="mb-1 font-display text-xl">
        {title}
      </legend>
      {hint ? (
        <p id={ids.hint} className="-mt-1 text-muted">
          {hint}
        </p>
      ) : null}
      <Input
        question={question}
        answers={answers}
        value={value}
        field={field}
        {...{ onAnswer, onClear }}
      />
      {error ? (
        <p id={ids.error} role="alert" className="text-sm text-error-text">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

interface Field {
  ids: { title: string; hint: string; error: string };
  title: string;
  describedBy: string | undefined;
  error: boolean;
}

interface InputProps {
  question: QuizQuestion;
  answers: QuizAnswers;
  value: QuizAnswerValue | undefined;
  field: Field;
  onAnswer: (value: QuizAnswerValue) => void;
  onClear: () => void;
}

const choiceClass =
  'flex cursor-pointer items-start gap-3 rounded-2xl border-1.5 border-border bg-background p-4 ' +
  'transition-colors hover:bg-surface has-[:checked]:border-accent-line has-[:checked]:bg-surface ' +
  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-line';

function Input(props: InputProps) {
  const { question: q, value, onAnswer } = props;
  switch (q.kind) {
    case 'single':
      return (
        <div className="grid gap-2">
          {q.options.map((o) => (
            <label key={o.value} className={choiceClass}>
              <input
                type="radio"
                name={q.id}
                value={o.value}
                checked={value === o.value}
                onChange={() => onAnswer(o.value)}
                className="mt-1 size-5 shrink-0 accent-accent-line"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{t(o.labelKey)}</span>
                {o.descriptionKey ? (
                  <span className="text-sm text-muted">{t(o.descriptionKey)}</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      );
    case 'multi': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="grid gap-2">
          {q.options.map((o) => (
            <label key={o.value} className={choiceClass}>
              <input
                type="checkbox"
                name={q.id}
                value={o.value}
                checked={selected.includes(o.value)}
                onChange={() =>
                  onAnswer(
                    selected.includes(o.value)
                      ? selected.filter((s) => s !== o.value)
                      : [...selected, o.value],
                  )
                }
                className="mt-1 size-5 shrink-0 accent-accent-line"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{t(o.labelKey)}</span>
                {o.descriptionKey ? (
                  <span className="text-sm text-muted">{t(o.descriptionKey)}</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      );
    }
    case 'number': {
      const range = q.range(props.answers);
      const unit = (n: number) => (q.unitKey ? t(q.unitKey, { count: n }) : String(n));
      return range.max - range.min <= STEPPER_MAX_SPAN ? (
        <Stepper
          label={props.field.title}
          value={typeof value === 'number' ? value : range.min}
          min={range.min}
          max={range.max}
          step={1}
          format={(n) => (q.unitKey ? `${n} ${unit(n)}` : String(n))}
          onChange={onAnswer}
        />
      ) : (
        <NumberInput {...props} unit={q.unitKey ? t(q.unitKey) : undefined} />
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
        <textarea
          aria-labelledby={props.field.ids.title}
          aria-describedby={props.field.describedBy}
          value={typeof value === 'string' ? value : ''}
          maxLength={q.maxLength}
          rows={4}
          onChange={(e) => (e.target.value === '' ? props.onClear() : onAnswer(e.target.value))}
          className={`${textInput} py-3`}
        />
      );
    case 'confirm':
      return (
        <label className={choiceClass}>
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onAnswer(e.target.checked)}
            className="mt-1 size-5 shrink-0 accent-accent-line"
          />
          <span>{t(q.labelKey)}</span>
        </label>
      );
  }
}

function Stepper({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
  onChange: (n: number) => void;
}) {
  const button =
    'flex size-11 shrink-0 items-center justify-center rounded-full border-1.5 border-border ' +
    'text-xl font-semibold hover:bg-surface disabled:opacity-40';
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`${t('common.decrease')} ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
        className={button}
      >
        −
      </button>
      <output
        aria-live="polite"
        className="min-w-24 text-center text-lg font-semibold tabular-nums"
      >
        {format(value)}
      </output>
      <button
        type="button"
        aria-label={`${t('common.increase')} ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
        className={button}
      >
        +
      </button>
    </div>
  );
}

function NumberInput({ value, field, onAnswer, onClear, unit }: InputProps & { unit?: string }) {
  const [text, setText] = useState(typeof value === 'number' ? String(value) : '');
  return (
    <div className="flex items-center gap-3">
      <input
        inputMode="numeric"
        aria-labelledby={field.ids.title}
        aria-describedby={field.describedBy}
        aria-invalid={field.error}
        value={text}
        maxLength={4}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          setText(digits);
          if (digits === '') onClear();
          else onAnswer(Number(digits));
        }}
        className={`${textInput} max-w-40 tabular-nums`}
      />
      {unit ? <span className="text-muted">{unit}</span> : null}
    </div>
  );
}

interface Parts {
  h: string;
  m: string;
  s: string;
}

function toParts(seconds: number | undefined, withHours: boolean): Parts {
  if (seconds === undefined) return { h: '', m: '', s: '' };
  const h = withHours ? Math.floor(seconds / 3600) : 0;
  const m = Math.floor((seconds - h * 3600) / 60);
  const s = seconds % 60;
  return { h: h > 0 ? String(h) : '', m: String(m), s: String(s).padStart(2, '0') };
}

function DurationInput({ question, value, field, onAnswer, onClear }: InputProps) {
  const withHours = question.kind === 'duration' && Boolean(question.withHours);
  const [parts, setParts] = useState(() =>
    toParts(typeof value === 'number' ? value : undefined, withHours),
  );
  const [invalid, setInvalid] = useState(false);

  const change = (next: Parts) => {
    setParts(next);
    if (next.h === '' && next.m === '' && next.s === '') {
      setInvalid(false);
      onClear();
      return;
    }
    const [h, m, s] = [Number(next.h || 0), Number(next.m || 0), Number(next.s || 0)];
    const bad = s >= 60 || (withHours && m >= 60);
    setInvalid(bad);
    if (bad) onClear();
    else onAnswer(h * 3600 + m * 60 + s);
  };

  const units = [
    ...(withHours ? [['h', t('units.hours'), t('units.h')] as const] : []),
    ['m', t('units.minutes'), t('units.min')] as const,
    ['s', t('units.seconds'), t('units.s')] as const,
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {units.map(([key, name, short]) => (
          <label key={key} className="flex items-center gap-1.5">
            <input
              inputMode="numeric"
              aria-label={`${field.title} – ${name}`}
              aria-describedby={field.describedBy}
              aria-invalid={field.error || invalid}
              maxLength={2}
              value={parts[key]}
              onChange={(e) => change({ ...parts, [key]: e.target.value.replace(/\D/g, '') })}
              className={`${textInput} w-16 text-center tabular-nums`}
            />
            <span className="text-sm text-muted">{short}</span>
          </label>
        ))}
        {question.kind === 'duration' && question.unitKey ? (
          <span className="text-sm text-muted">{t(question.unitKey)}</span>
        ) : null}
      </div>
      {invalid ? (
        <p role="alert" className="text-sm text-error-text">
          {t('validation.invalidDuration')}
        </p>
      ) : null}
    </div>
  );
}

function WeekMinutesInput({ question, value, onAnswer }: InputProps) {
  if (question.kind !== 'weekMinutes') return null;
  const minutes = Array.isArray(value) ? (value as number[]) : [0, 0, 0, 0, 0, 0, 0];
  const total = minutes.reduce((sum, m) => sum + m, 0);
  const { min, max, step } = question.range;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
        {minutes.map((m, day) => (
          <li key={day} className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="font-medium">{t(`quiz.availability.weekdays.${day}`)}</span>
            <Stepper
              label={t(`quiz.availability.weekdays.${day}`)}
              value={m}
              min={min}
              max={max}
              step={step}
              format={(n) =>
                n === 0 ? t('quiz.availability.rest') : t('quiz.availability.minutes', { count: n })
              }
              onChange={(next) => onAnswer(minutes.map((x, i) => (i === day ? next : x)))}
            />
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted tabular-nums">
        {t('quiz.availability.total', { hours: Math.round(total / 6) / 10 })}
      </p>
    </div>
  );
}

const isoOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

function DateInput({ question, value, field, onAnswer, onClear }: InputProps) {
  if (question.kind !== 'date') return null;
  const today = new Date();
  return (
    <div className="flex flex-col items-start gap-2">
      <input
        type="date"
        aria-labelledby={field.ids.title}
        aria-describedby={field.describedBy}
        aria-invalid={field.error}
        min={isoOf(addDays(today, question.rangeDays.min))}
        max={isoOf(addDays(today, question.rangeDays.max))}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => (e.target.value ? onAnswer(e.target.value) : onClear())}
        className={`${textInput} max-w-56`}
      />
      {question.optional && typeof value === 'string' ? (
        <button
          type="button"
          onClick={onClear}
          className="text-sm font-medium underline underline-offset-2"
        >
          {t('quiz.targetDate.clear')}
        </button>
      ) : null}
      {question.optional && typeof value !== 'string' ? (
        <p className="text-sm text-muted">{t('quiz.targetDate.none')}</p>
      ) : null}
    </div>
  );
}
