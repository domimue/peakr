import { messages } from '@/i18n';
import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from '@/lib/og-image';

export const alt = messages.meta.ogAlt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({ title: messages.home.hero.title, subtitle: messages.home.hero.eyebrow });
}
