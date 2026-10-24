import 'server-only';

import { adminClient, currentUser, isAccount, sessionClient } from '@/lib/supabase/server';

import { claimFunnel, type ClaimOutcome } from './claim';
import { clearFunnelCookie, funnelUserId } from './visitor';

/**
 * After every website sign-in: the account takes over what this browser's anonymous quiz user did
 * (answers, a checkout). With `sessionId` (success page) also the checkout of that session, which
 * may come from another device when the email matches. Never throws – signing in must not fail
 * because of it; the success page shows a hint when a claim failed.
 */
export async function claimAfterSignIn(sessionId?: string): Promise<ClaimOutcome | 'failed'> {
  const user = await currentUser(await sessionClient());
  const admin = adminClient();
  if (!isAccount(user) || !admin) return 'failed';
  try {
    const outcome = await claimFunnel(admin, user, {
      cookieUserId: await funnelUserId(),
      ...(sessionId ? { sessionId } : {}),
    });
    if (!outcome.error) await clearFunnelCookie();
    return outcome;
  } catch (e) {
    console.error('Claiming the funnel failed', String(e));
    return 'failed';
  }
}
