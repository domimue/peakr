'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { primaryButton, secondaryButton, textInput } from '@/components/ui';
import { messages } from '@/i18n';

import { saveForecastEmail, type EmailState } from './quiz-actions';

const t = messages.funnel.email;

/** Optional email before the forecast; nothing is stored without the consent box ticked. */
export function EmailForm({ email }: { email: string | null }) {
  const [state, action, pending] = useActionState<EmailState, FormData>(saveForecastEmail, {
    status: 'idle',
  });
  const error = state.status === 'error' ? state.error : null;
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="forecast-email" className="text-sm font-semibold">
          {t.emailLabel}
        </label>
        <input
          id="forecast-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          defaultValue={state.status === 'error' ? state.email : (email ?? '')}
          placeholder={t.emailPlaceholder}
          aria-invalid={error === 'invalidEmail'}
          aria-describedby={error ? 'forecast-email-error' : undefined}
          className={textInput}
        />
      </div>
      <label className="flex items-start gap-3 text-sm leading-relaxed">
        <input
          name="consent"
          type="checkbox"
          defaultChecked={email !== null}
          aria-invalid={error === 'consentRequired'}
          className="mt-1 size-5 shrink-0 accent-accent-line"
        />
        <span>
          {t.consent}{' '}
          <Link href="/privacy" className="font-medium underline underline-offset-2">
            {t.privacyLink}
          </Link>
        </span>
      </label>
      {error ? (
        <p id="forecast-email-error" role="alert" className="text-sm text-error-text">
          {t.errors[error]}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={pending} className={primaryButton}>
          {t.submit}
        </button>
        <Link href="/quiz/forecast" className={secondaryButton}>
          {t.skip}
        </Link>
      </div>
    </form>
  );
}
