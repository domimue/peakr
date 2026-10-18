/**
 * Target of "Build your personal plan" on every tool page. Points to the waitlist until the
 * quiz funnel exists on the website; then switch it to the quiz entry.
 */
export const QUIZ_HREF = '/#waitlist';

export type ToolKey = 'hrZones' | 'zone2' | 'pace' | 'swim';

export const TOOLS = [
  { key: 'hrZones', href: '/tools/heart-rate-zones' },
  { key: 'zone2', href: '/tools/zone-2' },
  { key: 'pace', href: '/tools/pace' },
  { key: 'swim', href: '/tools/swim-css' },
] as const satisfies readonly { key: ToolKey; href: string }[];
