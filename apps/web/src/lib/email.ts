import 'server-only';

/**
 * Transactional email from the website, same provider and settings as the Edge Functions
 * (`supabase/functions/_shared/email.ts`): Resend with RESEND_API_KEY and the sender EMAIL_FROM.
 * Without both, nothing is sent. Never logs addresses or message bodies.
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

export function emailProvider(): EmailProvider | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return null;
  return {
    async send(message) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, ...message, to: [message.to] }),
      });
      if (!response.ok) throw new Error(`Email provider failed: ${response.status}`);
    },
  };
}
