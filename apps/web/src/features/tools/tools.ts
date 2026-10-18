/** Entry point of the quiz funnel; every tool page links here ("Build your personal plan"). */
export const QUIZ_HREF = '/quiz';

export type ToolKey = 'hrZones' | 'zone2' | 'pace' | 'swim';

export const TOOLS = [
  { key: 'hrZones', href: '/tools/heart-rate-zones' },
  { key: 'zone2', href: '/tools/zone-2' },
  { key: 'pace', href: '/tools/pace' },
  { key: 'swim', href: '/tools/swim-css' },
] as const satisfies readonly { key: ToolKey; href: string }[];
