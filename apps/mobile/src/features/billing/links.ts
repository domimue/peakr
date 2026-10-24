/**
 * Legal pages on the website (terms, privacy). The stores require them next to a subscription
 * offer; they are information pages, never the web checkout (CLAUDE.md "Store rules").
 */
const site = process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? '';

export const legalLinks = site ? { terms: `${site}/terms`, privacy: `${site}/privacy` } : null;
