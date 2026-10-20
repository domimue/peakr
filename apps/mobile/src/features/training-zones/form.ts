import type { ValidationIssue } from '@peakr/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DurationParts } from '@/ui';

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

const INTEGER = /^\d+$/;

export function useIntegerField(initial?: number | null) {
  const [text, setText] = useState(initial == null ? '' : String(initial));
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

/** Splits seconds into duration field parts; minutes absorb the hours when `showHours` is off. */
export function toDurationParts(totalSec: number | null | undefined, showHours: boolean) {
  if (totalSec == null) return { h: '', m: '', s: '' };
  const rounded = Math.round(totalSec);
  const h = showHours ? Math.floor(rounded / 3600) : 0;
  const m = Math.floor((rounded - h * 3600) / 60);
  return { h: h > 0 ? String(h) : '', m: String(m), s: String(rounded % 60) };
}

export function useDurationField({
  showHours,
  initialSec,
}: {
  showHours: boolean;
  initialSec?: number | null;
}) {
  const [parts, setParts] = useState<DurationParts>(() => toDurationParts(initialSec, showHours));
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
 * Returns a function that turns a field's parse error or engine issue into a translated message.
 * Parse errors show immediately; engine issues only after the field was left once, so nobody
 * gets "out of range" after typing the first digit.
 */
export function useFieldError() {
  const { t } = useTranslation();
  return function fieldError<F extends string>(
    field: FieldState,
    name: F,
    issues: readonly ValidationIssue<F>[],
    formatParam: (value: number) => string = String,
  ): string | undefined {
    if (field.parseError) return t(`validation.${field.parseError}`);
    const issue = issues.find((i) => i.field === name);
    if (!issue || !field.touched) return undefined;
    const param = (key: string) => {
      const value = issue.params?.[key];
      return value === undefined ? '' : formatParam(value);
    };
    return t(`validation.${issue.code}`, {
      min: param('min'),
      max: param('max'),
      hrMax: param('hrMax'),
    });
  };
}
