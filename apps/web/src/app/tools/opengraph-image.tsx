import { messages } from '@/i18n';
import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from '@/lib/og-image';

const t = messages.tools.index;

export const alt = t.title;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({ title: t.title, subtitle: t.subtitle });
}
