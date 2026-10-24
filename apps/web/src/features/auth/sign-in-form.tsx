'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { primaryButton, secondaryButton, textInput } from '@/components/ui';
import { interpolate, messages } from '@/i18n';

import { sendSignInLink, signInWithProvider, verifySignInCode, type SignInState } from './actions';

const t = messages.auth;

/**
 * Email (link + code fallback), Google and Apple. `email` prefills the address – on the success
 * page that is the checkout email, so the account gets the purchase without further proof.
 */
export function SignInForm({ next, email: initialEmail = '' }: { next: string; email?: string }) {
  const [linkState, sendAction, sending] = useActionState<SignInState, FormData>(sendSignInLink, {
    status: 'idle',
  });
  const [codeState, verifyAction, verifying] = useActionState<SignInState, FormData>(
    verifySignInCode,
    { status: 'idle' },
  );
  const [reset, setReset] = useState(0);
  const sent = linkState.status === 'sent' && reset === 0 ? linkState : null;
  const linkError = linkState.status === 'error' ? linkState.error : null;
  const codeError = codeState.status === 'error' ? codeState.error : null;

  return (
    <div className="flex flex-col gap-5">
      {sent ? (
        <form action={verifyAction} className="flex flex-col gap-3">
          <p role="status" className="leading-relaxed">
            {interpolate(t.sent, { email: sent.email })}
          </p>
          <input type="hidden" name="email" value={sent.email} />
          <input type="hidden" name="next" value={next} />
          <label htmlFor="signin-code" className="text-sm font-semibold">
            {t.codeLabel}
          </label>
          <input
            id="signin-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-invalid={codeError !== null}
            aria-describedby={codeError ? 'signin-code-error' : undefined}
            className={`${textInput} tabular-nums tracking-widest`}
          />
          {codeError ? (
            <p id="signin-code-error" role="alert" className="text-sm text-error-text">
              {t.errors[codeError]}
            </p>
          ) : null}
          <button type="submit" disabled={verifying} className={primaryButton}>
            {t.verify}
          </button>
          <button
            type="button"
            onClick={() => setReset((n) => n + 1)}
            className="self-start text-sm font-medium underline underline-offset-2"
          >
            {t.otherEmail}
          </button>
        </form>
      ) : (
        <form
          action={(data) => {
            setReset(0);
            sendAction(data);
          }}
          noValidate
          className="flex flex-col gap-3"
        >
          <label htmlFor="signin-email" className="text-sm font-semibold">
            {t.emailLabel}
          </label>
          <input
            id="signin-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={linkState.status === 'error' ? (linkState.email ?? '') : initialEmail}
            placeholder={t.emailPlaceholder}
            aria-invalid={linkError === 'invalidEmail'}
            aria-describedby={linkError ? 'signin-email-error' : undefined}
            className={textInput}
          />
          <input type="hidden" name="next" value={next} />
          {linkError ? (
            <p id="signin-email-error" role="alert" className="text-sm text-error-text">
              {t.errors[linkError]}
            </p>
          ) : null}
          <button type="submit" disabled={sending} className={primaryButton}>
            {sending ? t.sending : t.sendLink}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-muted">{t.or}</p>
      <form action={signInWithProvider} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <button type="submit" name="provider" value="google" className={secondaryButton}>
          {t.google}
        </button>
        <button type="submit" name="provider" value="apple" className={secondaryButton}>
          {t.apple}
        </button>
      </form>
      <p className="text-sm text-muted">
        {t.terms.split(/(\{\{terms\}\}|\{\{privacy\}\})/).map((part) =>
          part === '{{terms}}' ? (
            <Link key={part} href="/terms" className="underline underline-offset-2">
              {t.termsLink}
            </Link>
          ) : part === '{{privacy}}' ? (
            <Link key={part} href="/privacy" className="underline underline-offset-2">
              {t.privacyLink}
            </Link>
          ) : (
            part
          ),
        )}
      </p>
    </div>
  );
}
