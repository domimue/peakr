import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Expo push to all devices of a user. Every device gets a silent push (`_contentAvailable`, data
 * only) that wakes the app to sync; devices with activity notifications turned on get a visible
 * notification instead (CLAUDE.md "Account & notifications": in-app only unless enabled).
 * EXPO_ACCESS_TOKEN is optional (needed once "enhanced push security" is on in EAS).
 */

interface PushMessage {
  to: string;
  data: Record<string, string>;
  title?: string;
  body?: string;
  priority: 'high' | 'normal';
  channelId?: string;
  _contentAvailable?: boolean;
}

export async function pushToUser(
  admin: SupabaseClient,
  userId: string,
  data: Record<string, string>,
  alert: { title: string; body: string },
  /**
   * `alwaysAlert`: visible on every device (trial-ending and daily reminder), whatever the
   * activity setting. `channelId`: the Android notification channel the app created for it.
   */
  options: { alwaysAlert?: boolean; channelId?: string } = {},
): Promise<void> {
  const { data: tokens, error } = await admin
    .from('push_tokens')
    .select('token, activity_alerts')
    .eq('user_id', userId);
  if (error) throw error;
  if (!tokens || tokens.length === 0) return;
  const messages: PushMessage[] = tokens.map((t) =>
    t.activity_alerts || options.alwaysAlert
      ? {
          to: t.token,
          data,
          title: alert.title,
          body: alert.body,
          priority: 'high',
          ...(options.channelId ? { channelId: options.channelId } : {}),
        }
      : { to: t.token, data, priority: 'high', _contentAvailable: true },
  );
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers,
    body: JSON.stringify(messages),
  });
  if (!response.ok) {
    console.warn('Expo push failed', response.status, await response.text());
    return;
  }
  // Tokens of uninstalled apps are removed so they are not tried again.
  const result = (await response.json()) as {
    data?: { status: string; details?: { error?: string } }[];
  };
  const stale = (result.data ?? [])
    .map((r, i) => (r.details?.error === 'DeviceNotRegistered' ? messages[i]?.to : null))
    .filter((t): t is string => typeof t === 'string');
  if (stale.length > 0) await admin.from('push_tokens').delete().in('token', stale);
}
