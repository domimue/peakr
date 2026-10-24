import { NextResponse, type NextRequest } from 'next/server';

import { claimAfterSignIn } from '@/features/funnel/after-sign-in';

/**
 * After the account was created or signed in on the success page: attach the checkout, the
 * answers and the plan (`claimFunnel`), then on to "Get the app".
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const sessionId = searchParams.get('session_id') ?? '';
  const back = (error: string) => {
    const url = new URL('/checkout/success', origin);
    url.searchParams.set('session_id', sessionId);
    url.searchParams.set('error', error);
    return NextResponse.redirect(url);
  };
  const outcome = await claimAfterSignIn(sessionId || undefined);
  if (outcome === 'failed') return back('failed');
  if (outcome.error) return back(outcome.error);
  const url = new URL('/get-app', origin);
  url.searchParams.set('welcome', '1');
  if (outcome.cancelled) url.searchParams.set('cancelled', '1');
  if (outcome.keptPlan) url.searchParams.set('kept', '1');
  return NextResponse.redirect(url);
}
