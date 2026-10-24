/**
 * Transactional email behind one interface (`EmailProvider`). The first implementation is Resend
 * (`RESEND_API_KEY`, sender `EMAIL_FROM`, e.g. "Peakr <hello@peakr.ch>"); without both, no email is
 * sent and the caller falls back to push only. Never logs addresses or message bodies.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

class ResendProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, ...message, to: [message.to] }),
    });
    if (!response.ok) throw new Error(`Email provider failed: ${response.status}`);
  }
}

export function emailProvider(): EmailProvider | null {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  return apiKey && from ? new ResendProvider(apiKey, from) : null;
}
