import { assetLinks } from '@/features/get-app/app-links';

/**
 * Android App Links verification (docs/app-links.md). Served on every host the app claims, as
 * plain JSON with status 200 and no redirect. 404 until the fingerprints are configured.
 */
export function GET() {
  const body = assetLinks();
  if (!body) return new Response('Not configured', { status: 404 });
  return Response.json(body, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
