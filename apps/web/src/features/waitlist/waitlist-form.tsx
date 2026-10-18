'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { messages } from '@/i18n';

import { joinWaitlist } from './actions';
import { HONEYPOT_FIELD, type WaitlistState } from './validate';

const t = messages.waitlist;

export function WaitlistForm() {
  const [state, formAction, pending] = useActionState<WaitlistState, FormData>(joinWaitlist, {
    status: 'idle',
  });

  if (state.status === 'success') {
    return (
      <p role="status" className="rounded-2xl bg-surface p-6 text-lg font-medium">
        {t.success}
      </p>
    );
  }

  const error = state.status === 'error' ? state.error : undefined;
  const emailError = error === 'invalidEmail';
  const consentError = error === 'consentRequired';

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="waitlist-email" className="text-sm font-semibold">
          {t.emailLabel}
        </label>
        <input
          id="waitlist-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.status === 'error' ? state.email : ''}
          placeholder={t.emailPlaceholder}
          aria-invalid={emailError}
          aria-describedby={emailError ? 'waitlist-email-error' : undefined}
          className="min-h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent-line aria-invalid:border-error-text"
        />
        {emailError ? (
          <p id="waitlist-email-error" className="text-sm text-error-text">
            {t.errors.invalidEmail}
          </p>
        ) : null}
      </div>

      {/* Honeypot: hidden from people and assistive tech, bots tend to fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`waitlist-${HONEYPOT_FIELD}`}>{HONEYPOT_FIELD}</label>
        <input
          id={`waitlist-${HONEYPOT_FIELD}`}
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-start gap-3 text-sm leading-relaxed">
          <input
            name="consent"
            type="checkbox"
            required
            // React resets the form after each submit; keep a given consent ticked on errors.
            defaultChecked={state.status === 'error' && state.consent}
            aria-invalid={consentError}
            aria-describedby={consentError ? 'waitlist-consent-error' : undefined}
            className="mt-1 size-5 shrink-0 accent-accent-line"
          />
          <span>
            {t.consent}{' '}
            <Link href="/privacy" className="font-medium underline underline-offset-2">
              {t.privacyLink}
            </Link>
          </span>
        </label>
        {consentError ? (
          <p id="waitlist-consent-error" className="text-sm text-error-text">
            {t.errors.consentRequired}
          </p>
        ) : null}
      </div>

      {error === 'unavailable' ? (
        <p role="alert" className="text-sm text-error-text">
          {t.errors.unavailable}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-button bg-accent px-6 font-semibold text-on-accent transition-colors hover:bg-accent-pressed disabled:opacity-60"
      >
        {pending ? t.submitting : t.submit}
      </button>
    </form>
  );
}
