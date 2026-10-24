import { NextResponse, type NextRequest } from 'next/server';

import { safeNext } from '@/features/auth/next-path';
import { sessionClient } from '@/lib/supabase/server';

/** Magic link and Google/Apple redirects land here (`?code=…`, PKCE) and go on to `next`. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get('next'));
  const code = searchParams.get('code');
  const supabase = await sessionClient();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  // Opened in another browser (no PKCE verifier), expired, or cancelled: sign in again, the email
  // also carries a code for exactly this case.
  const login = new URL('/login', origin);
  login.searchParams.set('next', next);
  login.searchParams.set('error', 'link');
  return NextResponse.redirect(login);
}
