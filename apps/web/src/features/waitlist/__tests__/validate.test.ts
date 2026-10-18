import { describe, expect, it } from 'vitest';

import { parseWaitlistForm } from '../validate';

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe('parseWaitlistForm', () => {
  it('normalises the email and accepts consent', () => {
    expect(parseWaitlistForm(form({ email: '  Ana@Example.COM ', consent: 'on' }))).toEqual({
      ok: true,
      email: 'ana@example.com',
      isBot: false,
    });
  });

  it('rejects an invalid email before checking consent', () => {
    expect(parseWaitlistForm(form({ email: 'ana@example' }))).toMatchObject({
      ok: false,
      error: 'invalidEmail',
    });
  });

  it('requires the consent checkbox', () => {
    expect(parseWaitlistForm(form({ email: 'ana@example.com' }))).toMatchObject({
      ok: false,
      error: 'consentRequired',
    });
  });

  it('flags a filled honeypot as a bot', () => {
    expect(
      parseWaitlistForm(form({ email: 'a@b.ch', consent: 'on', company: 'Spam Inc' })),
    ).toMatchObject({ ok: true, isBot: true });
  });
});
