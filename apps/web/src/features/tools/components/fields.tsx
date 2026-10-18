'use client';

import { useId } from 'react';

import type { DurationParts } from '../form';

const inputClass =
  'rounded-lg border bg-background px-3 py-2 text-base tabular-nums outline-none ' +
  'focus:ring-2 focus:ring-accent-line/40';

function borderClass(error: string | undefined) {
  return error ? 'border-error-text' : 'border-border focus:border-accent-line';
}

function FieldMessages({
  hintId,
  errorId,
  hint,
  error,
}: {
  hintId: string;
  errorId: string;
  hint?: string;
  error?: string;
}) {
  return (
    <>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-error-text">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </>
  );
}

function describedBy(ids: Record<string, string | undefined>, hintId: string, errorId: string) {
  return (
    [ids.error ? errorId : null, ids.hint ? hintId : null].filter(Boolean).join(' ') || undefined
  );
}

export interface NumberFieldProps {
  label: string;
  value: string;
  onChange: (text: string) => void;
  onBlur: () => void;
  hint?: string;
  error?: string;
  suffix?: string;
  maxLength?: number;
}

export function NumberField({
  label,
  value,
  onChange,
  onBlur,
  hint,
  error,
  suffix,
  maxLength = 3,
}: NumberFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={maxLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy({ error, hint }, hintId, errorId)}
          className={`${inputClass} ${borderClass(error)} w-full max-w-32`}
        />
        {suffix ? <span className="text-muted">{suffix}</span> : null}
      </div>
      <FieldMessages hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </div>
  );
}

export interface DurationFieldProps {
  label: string;
  value: DurationParts;
  onChange: (parts: DurationParts) => void;
  onBlur: () => void;
  showHours?: boolean;
  unitLabels: DurationParts;
  /** Spoken names of the parts, e.g. "minutes" – combined with the label for each input. */
  partNames: DurationParts;
  hint?: string;
  error?: string;
}

const DIGITS = /\D/g;

export function DurationField({
  label,
  value,
  onChange,
  onBlur,
  showHours = false,
  unitLabels,
  partNames,
  hint,
  error,
}: DurationFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const parts: (keyof DurationParts)[] = showHours ? ['h', 'm', 's'] : ['m', 's'];
  return (
    <fieldset
      className="flex flex-col gap-1.5"
      aria-describedby={describedBy({ error, hint }, hintId, errorId)}
    >
      <legend className="mb-1.5 font-medium">{label}</legend>
      <div className="flex flex-wrap items-center gap-3">
        {parts.map((part) => (
          <div key={part} className="flex items-center gap-1.5">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={2}
              aria-label={`${label}, ${partNames[part]}`}
              aria-invalid={error ? true : undefined}
              value={value[part]}
              onChange={(e) => onChange({ ...value, [part]: e.target.value.replace(DIGITS, '') })}
              onBlur={onBlur}
              className={`${inputClass} ${borderClass(error)} w-16 text-center`}
            />
            <span className="text-muted">{unitLabels[part]}</span>
          </div>
        ))}
      </div>
      <FieldMessages hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </fieldset>
  );
}

export interface SegmentedControlProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** A row of mutually exclusive choices, exposed as a radio group. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex w-full rounded-xl border border-border bg-surface p-1 sm:w-auto"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
              selected ? 'bg-background shadow-sm' : 'text-muted hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
