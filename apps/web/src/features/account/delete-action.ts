'use server';

import { redirect } from 'next/navigation';

import { currentUser, isAccount, sessionClient } from '@/lib/supabase/server';

import { confirmsDeletion, requestDeletion } from './deletion';

/** Deletes the signed-in account and all its data, then signs out on this browser. */
export async function deleteAccount(formData: FormData): Promise<void> {
  const client = await sessionClient();
  const user = await currentUser(client);
  if (!client || !isAccount(user)) redirect('/login?next=/account/delete');
  if (!confirmsDeletion(formData.get('confirm'))) redirect('/account/delete?error=confirm');

  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const deleted = token && url && key ? await requestDeletion(url, key, token) : false;
  if (!deleted) redirect('/account/delete?error=failed');

  // The user no longer exists; only the cookies of this browser are left to clear.
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  redirect('/account/deleted');
}
