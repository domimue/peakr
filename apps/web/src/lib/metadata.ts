import type { Metadata } from 'next';

/** Title (already including the brand), description, canonical URL and social cards of a page. */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', title, description, url: path },
    twitter: { card: 'summary_large_image', title, description },
  };
}

/** Funnel, checkout, account and auth pages: personal, never indexed, not in the sitemap. */
export function privateMetadata(title: string): Metadata {
  return { title: { absolute: title }, robots: { index: false, follow: false } };
}
