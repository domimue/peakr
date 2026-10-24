import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/proxy';

export function proxy(request: NextRequest) {
  return updateSession(request);
}

// Only the pages that use a session; the marketing pages and tools stay fully static.
export const config = {
  matcher: [
    '/quiz/:path*',
    '/checkout/:path*',
    '/account/:path*',
    '/login',
    '/auth/:path*',
    '/get-app',
  ],
};
