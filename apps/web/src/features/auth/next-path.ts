/** Only same-site paths are followed after sign-in ("/account", never "//evil.test" or a URL). */
export function safeNext(value: unknown, fallback = '/account'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }
  return value.includes('\\') ? fallback : value;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}
