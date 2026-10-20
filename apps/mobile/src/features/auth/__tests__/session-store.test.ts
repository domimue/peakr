import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/data/supabase';

import { selectAccountUserId, useSessionStore } from '../session-store';

jest.mock('@/data/supabase', () => ({
  supabase: {
    auth: {
      signInAnonymously: jest.fn(async () => ({
        data: {
          session: { user: { id: 'anon-1', is_anonymous: true } },
          user: { id: 'anon-1', is_anonymous: true },
        },
        error: null,
      })),
    },
  },
}));

const signInAnonymously = supabase!.auth.signInAnonymously as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ session: null, isAnonymous: false, ready: true });
});

describe('session store', () => {
  it('signs in anonymously once, also when asked twice at the same time', async () => {
    const { ensureSession } = useSessionStore.getState();
    await expect(Promise.all([ensureSession(), ensureSession()])).resolves.toEqual([
      'anon-1',
      'anon-1',
    ]);
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().isAnonymous).toBe(true);
    expect(selectAccountUserId(useSessionStore.getState())).toBeNull();
  });

  it('keeps an existing session', async () => {
    useSessionStore.setState({ session: { user: { id: 'user-1' } } as unknown as Session });
    await expect(useSessionStore.getState().ensureSession()).resolves.toBe('user-1');
    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(selectAccountUserId(useSessionStore.getState())).toBe('user-1');
  });
});
