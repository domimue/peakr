import type { ValidationIssue } from '@peakr/engine';
import { useState } from 'react';

import { interpolate, messages } from '@/i18n';

/** Errors detected while parsing the raw text, before the engine sees a number. */
export type ParseError = 'invalidNumber' | 'invalidDuration';

export interface FieldState {
  /** True once the field lost focus – engine issues are only shown after that. */
  touched: boolean;
  empty: boolean;
  value: number | undefined;
  parseError: ParseError | undefined;
  onBlur: () => void;
}

export interface DurationParts {
  h: string;
  m: string;
  s: string;
}

const INTEGER = /^\d+$/;

export function useIntegerField() {
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const trimmed = text.trim();
  const isInteger = INTEGER.test(trimmed);
  const field: FieldState = {
    touched,
    empty: trimmed === '',
    value: isInteger ? Number(trimmed) : undefined,
    parseError: trimmed !== '' && !isInteger ? 'invalidNumber' : undefined,
    onBlur: () => setTouched(true),
  };
  return { ...field, text, setText };
}

export function useDurationField({ showHours }: { showHours: boolean }) {
  const [parts, setParts] = useState<DurationParts>({ h: '', m: '', s: '' });
  const [touched, setTouched] = useState(false);

  const h = showHours ? Number(parts.h || 0) : 0;
  const m = Number(parts.m || 0);
  const s = Number(parts.s || 0);
  const empty = (!showHours || parts.h === '') && parts.m === '' && parts.s === '';
  const invalid = !empty && (s >= 60 || (showHours && m >= 60));

  const field: FieldState = {
    touched,
    empty,
    value: empty || invalid ? undefined : h * 3600 + m * 60 + s,
    parseError: invalid ? 'invalidDuration' : undefined,
    onBlur: () => setTouched(true),
  };
  return { ...field, parts, setParts };
}

/**
 * Turns a field's parse error or engine issue into a message.
 * Parse errors show immediately; engine issues only after the field was left once, so nobody
 * gets "out of range" after typing the first digit.
 */
export function fieldError<F extends string>(
  field: FieldState,
  name: F,
  issues: readonly ValidationIssue<F>[],
  formatParam: (value: number) => string = String,
): string | undefined {
  if (field.parseError) return messages.validation[field.parseError];
  const issue = issues.find((i) => i.field === name);
  if (!issue || !field.touched) return undefined;
  const param = (key: string) => {
    const value = issue.params?.[key];
    return value === undefined ? '' : formatParam(value);
  };
  return interpolate(messages.validation[issue.code], {
    min: param('min'),
    max: param('max'),
    hrMax: param('hrMax'),
  });
}
