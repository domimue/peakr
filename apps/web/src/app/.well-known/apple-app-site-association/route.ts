import { appleAppSiteAssociation } from '@/features/get-app/app-links';

/**
 * iOS Universal Links (docs/app-links.md): no file extension, `application/json`, status 200 and
 * never a redirect – Apple's CDN does not follow one. 404 until APPLE_TEAM_ID is set.
 */
export function GET() {
  const body = appleAppSiteAssociation();
  if (!body) return new Response('Not configured', { status: 404 });
  return Response.json(body, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
